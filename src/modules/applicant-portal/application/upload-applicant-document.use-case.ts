import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  ApplicantAdmissionRequestStatus,
  AuditOutcome,
  FileVisibility,
  OrganizationStatus,
  SchoolStatus,
  UserType,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import {
  FILES_UPLOAD_MAX_SIZE_BYTES,
  isFilesUploadMimeTypeAllowed,
} from '../../files/uploads/domain/file-upload.constraints';
import {
  FilesUploadMimeNotAllowedException,
  FilesUploadSizeExceededException,
} from '../../files/uploads/domain/file-upload.exceptions';
import { UploadedMultipartFile } from '../../files/uploads/domain/uploaded-file';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  buildApplicantDocumentObjectKey,
  normalizeApplicantDocumentInput,
  resolveOptionalApplicantDocumentText,
  sanitizeApplicantOriginalFileName,
} from '../domain/applicant-document.inputs';
import { ApplicantDocumentResponseDto } from '../dto/applicant-document.dto';
import {
  AdmissionRequiredDocumentForUploadRecord,
  ApplicantAdmissionRequestForDocumentAccessRecord,
  ApplicantPortalRepository,
} from '../infrastructure/applicant-portal.repository';
import { presentApplicantDocument } from '../presenters/applicant-document.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

export interface UploadApplicantDocumentCommand {
  requestId: string;
  requiredDocumentId?: string;
  title?: string;
  documentType?: string;
  notes?: string;
  file?: UploadedMultipartFile;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UploadApplicantDocumentUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly storageService: StorageService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: UploadApplicantDocumentCommand,
  ): Promise<ApplicantDocumentResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const request =
      await this.applicantPortalRepository.findApplicantAdmissionRequestForDocumentAccess(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId: command.requestId,
        },
      );
    if (!request) {
      throw new NotFoundDomainException('Applicant request not found', {
        requestId: command.requestId,
      });
    }

    this.assertRequestSchoolIsSafe(request);
    this.assertRequestAllowsUpload(request);

    const normalizedInput = normalizeApplicantDocumentInput(command);
    const requiredDocument = command.requiredDocumentId
      ? await this.loadRequiredDocument(request, command.requiredDocumentId)
      : null;
    const documentText = requiredDocument
      ? {
          title: requiredDocument.title,
          documentType: requiredDocument.title,
        }
      : resolveOptionalApplicantDocumentText(normalizedInput);

    if (!documentText) {
      throw new ValidationDomainException(
        'Optional applicant documents require a title or document type',
        { fields: ['title', 'documentType'] },
      );
    }

    const uploadedFile = this.validateFile(command.file, requiredDocument);
    const objectKey = buildApplicantDocumentObjectKey({
      schoolId: request.schoolId,
      requestId: request.id,
      originalName: uploadedFile.originalname,
    });

    const storedObject = await this.storageService.saveObject({
      objectKey,
      body: uploadedFile.buffer,
      visibility: FileVisibility.PRIVATE,
      contentType: uploadedFile.mimeType,
    });

    const document = await (async () => {
      try {
        return await this.applicantPortalRepository.createApplicantAdmissionRequestDocument(
          {
            requestId: request.id,
            applicantUserId: applicantContext.applicantUserId,
            schoolId: request.schoolId,
            organizationId: request.organizationId,
            requiredDocumentId: requiredDocument?.id ?? null,
            applicationDocumentId: null,
            bridgeApplicationId: this.resolveBridgeApplicationId(request),
            title: documentText.title,
            documentType: documentText.documentType,
            notes: normalizedInput.notes,
            file: {
              bucket: storedObject.bucket,
              objectKey,
              originalName: sanitizeApplicantOriginalFileName(
                uploadedFile.originalname,
              ),
              mimeType: uploadedFile.mimeType,
              sizeBytes: BigInt(uploadedFile.buffer.byteLength),
              checksumSha256: createHash('sha256')
                .update(uploadedFile.buffer)
                .digest('hex'),
              visibility: FileVisibility.PRIVATE,
            },
          },
        );
      } catch (error) {
        await this.deleteStoredObjectQuietly(storedObject.bucket, objectKey);
        throw error;
      }
    })();

    await this.authRepository.createAuditLog({
      actorId: applicantContext.applicantUserId,
      userType: UserType.APPLICANT,
      organizationId: request.organizationId,
      schoolId: request.schoolId,
      module: 'applicant_portal',
      action: 'applicant.document.upload',
      resourceType: 'applicant_admission_request_document',
      resourceId: document.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      after: {
        requestId: request.id,
        requiredDocumentLinked: Boolean(requiredDocument),
        mimeType: uploadedFile.mimeType,
        sizeBytes: uploadedFile.buffer.byteLength,
        status: 'uploaded',
      },
    });

    return presentApplicantDocument(document);
  }

  private async loadRequiredDocument(
    request: ApplicantAdmissionRequestForDocumentAccessRecord,
    requiredDocumentId: string,
  ): Promise<AdmissionRequiredDocumentForUploadRecord> {
    const requiredDocument =
      await this.applicantPortalRepository.findActiveSchoolLevelRequiredDocumentForUpload(
        {
          schoolId: request.schoolId,
          requiredDocumentId,
        },
      );

    if (!requiredDocument) {
      throw new NotFoundDomainException('Required document not found', {
        requiredDocumentId,
      });
    }

    return requiredDocument;
  }

  private assertRequestSchoolIsSafe(
    request: ApplicantAdmissionRequestForDocumentAccessRecord,
  ): void {
    if (
      request.schoolId !== request.school.id ||
      request.organizationId !== request.school.organizationId ||
      request.school.status !== SchoolStatus.ACTIVE ||
      request.school.deletedAt ||
      request.school.organization.id !== request.organizationId ||
      request.school.organization.status !== OrganizationStatus.ACTIVE ||
      request.school.organization.deletedAt
    ) {
      throw new NotFoundDomainException('School not found', {
        requestId: request.id,
      });
    }
  }

  private assertRequestAllowsUpload(
    request: ApplicantAdmissionRequestForDocumentAccessRecord,
  ): void {
    if (request.status === ApplicantAdmissionRequestStatus.DRAFT) return;

    if (
      request.status === ApplicantAdmissionRequestStatus.SUBMITTED &&
      request.application?.status ===
        AdmissionApplicationStatus.DOCUMENTS_PENDING &&
      !request.application.deletedAt
    ) {
      return;
    }

    throw new DomainException({
      code: 'conflict',
      message: 'Applicant documents cannot be uploaded in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details: { requestId: request.id },
    });
  }

  private resolveBridgeApplicationId(
    request: ApplicantAdmissionRequestForDocumentAccessRecord,
  ): string | null {
    if (
      request.status === ApplicantAdmissionRequestStatus.SUBMITTED &&
      request.application?.id &&
      request.application.status ===
        AdmissionApplicationStatus.DOCUMENTS_PENDING &&
      !request.application.deletedAt
    ) {
      return request.application.id;
    }

    return null;
  }

  private validateFile(
    file: UploadedMultipartFile | undefined,
    requiredDocument: AdmissionRequiredDocumentForUploadRecord | null,
  ): UploadedMultipartFile & { mimeType: string } {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new ValidationDomainException(
        'A multipart file field named "file" is required',
        { field: 'file' },
      );
    }

    if (file.buffer.byteLength === 0) {
      throw new ValidationDomainException('Uploaded file cannot be empty', {
        field: 'file',
      });
    }

    if (file.buffer.byteLength > FILES_UPLOAD_MAX_SIZE_BYTES) {
      throw new FilesUploadSizeExceededException({
        maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES,
        actualSizeBytes: file.buffer.byteLength,
      });
    }

    const mimeType = file.mimetype.trim().toLowerCase();
    if (!isFilesUploadMimeTypeAllowed(mimeType)) {
      throw new FilesUploadMimeNotAllowedException({ mimeType });
    }

    const acceptedFileTypes = (requiredDocument?.acceptedFileTypes ?? []).map(
      (acceptedMimeType) => acceptedMimeType.trim().toLowerCase(),
    );
    if (acceptedFileTypes.length > 0 && !acceptedFileTypes.includes(mimeType)) {
      throw new FilesUploadMimeNotAllowedException({ mimeType });
    }

    return {
      ...file,
      mimeType,
    };
  }

  private async deleteStoredObjectQuietly(
    bucket: string,
    objectKey: string,
  ): Promise<void> {
    try {
      await this.storageService.deleteObject({ bucket, objectKey });
    } catch {
      // Preserve the original persistence error as the surfaced failure.
    }
  }
}
