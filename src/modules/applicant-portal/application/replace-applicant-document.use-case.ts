import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  ApplicantAdmissionRequestDocumentStatus,
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
  sanitizeApplicantOriginalFileName,
} from '../domain/applicant-document.inputs';
import { ApplicantDocumentResponseDto } from '../dto/applicant-document.dto';
import {
  AdmissionRequiredDocumentForUploadRecord,
  ApplicantAdmissionRequestDocumentMutationRecord,
  ApplicantPortalRepository,
} from '../infrastructure/applicant-portal.repository';
import { presentApplicantDocument } from '../presenters/applicant-document.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

const REPLACEABLE_APPLICANT_DOCUMENT_STATUSES = [
  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
  ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
  ApplicantAdmissionRequestDocumentStatus.REJECTED,
] as const;

export interface ReplaceApplicantDocumentCommand {
  requestId: string;
  documentId: string;
  title?: string;
  documentType?: string;
  notes?: string;
  file?: UploadedMultipartFile;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ReplaceApplicantDocumentUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly storageService: StorageService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: ReplaceApplicantDocumentCommand,
  ): Promise<ApplicantDocumentResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const oldDocument =
      await this.applicantPortalRepository.findApplicantAdmissionRequestDocumentForMutation(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId: command.requestId,
          documentId: command.documentId,
        },
      );
    if (!oldDocument) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: command.requestId,
        documentId: command.documentId,
      });
    }

    this.assertRequestSchoolIsSafe(oldDocument);
    this.assertRequestAllowsMutation(oldDocument);
    this.assertDocumentCanBeReplaced(oldDocument);

    const normalizedInput = normalizeApplicantDocumentInput(command);
    const requiredDocument = oldDocument.requiredDocumentId
      ? await this.loadRequiredDocument(oldDocument)
      : null;
    const documentText = requiredDocument
      ? {
          title: requiredDocument.title,
          documentType: requiredDocument.title,
        }
      : {
          title: normalizedInput.title ?? oldDocument.title,
          documentType:
            normalizedInput.documentType ?? oldDocument.documentType,
        };

    const uploadedFile = this.validateFile(command.file, requiredDocument);
    const objectKey = buildApplicantDocumentObjectKey({
      schoolId: oldDocument.schoolId,
      requestId: oldDocument.requestId,
      originalName: uploadedFile.originalname,
    });

    const storedObject = await this.storageService.saveObject({
      objectKey,
      body: uploadedFile.buffer,
      visibility: FileVisibility.PRIVATE,
      contentType: uploadedFile.mimeType,
    });

    const replacementDocument = await (async () => {
      try {
        const document =
          await this.applicantPortalRepository.replaceApplicantAdmissionRequestDocument(
            {
              oldDocumentId: oldDocument.id,
              requestId: oldDocument.requestId,
              applicantUserId: applicantContext.applicantUserId,
              schoolId: oldDocument.schoolId,
              organizationId: oldDocument.organizationId,
              requiredDocumentId: oldDocument.requiredDocumentId,
              bridgeApplicationId: this.resolveBridgeApplicationId(oldDocument),
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

        if (!document) {
          throw new NotFoundDomainException('Applicant document not found', {
            requestId: command.requestId,
            documentId: command.documentId,
          });
        }

        return document;
      } catch (error) {
        await this.deleteStoredObjectQuietly(storedObject.bucket, objectKey);
        throw error;
      }
    })();

    await this.authRepository.createAuditLog({
      actorId: applicantContext.applicantUserId,
      userType: UserType.APPLICANT,
      organizationId: oldDocument.organizationId,
      schoolId: oldDocument.schoolId,
      module: 'applicant_portal',
      action: 'applicant.document.replace',
      resourceType: 'applicant_admission_request_document',
      resourceId: oldDocument.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      after: {
        requestId: oldDocument.requestId,
        oldDocumentId: oldDocument.id,
        newDocumentId: replacementDocument.id,
        oldFileId: oldDocument.fileId,
        newFileId: replacementDocument.file.id,
        status: 'superseded',
      },
    });

    return presentApplicantDocument(replacementDocument);
  }

  private async loadRequiredDocument(
    oldDocument: ApplicantAdmissionRequestDocumentMutationRecord,
  ): Promise<AdmissionRequiredDocumentForUploadRecord> {
    const requiredDocument =
      await this.applicantPortalRepository.findActiveSchoolLevelRequiredDocumentForUpload(
        {
          schoolId: oldDocument.schoolId,
          requiredDocumentId: oldDocument.requiredDocumentId as string,
        },
      );

    if (!requiredDocument) {
      throw new NotFoundDomainException('Required document not found', {
        requiredDocumentId: oldDocument.requiredDocumentId,
      });
    }

    return requiredDocument;
  }

  private assertRequestSchoolIsSafe(
    oldDocument: ApplicantAdmissionRequestDocumentMutationRecord,
  ): void {
    const school = oldDocument.request.school;
    if (
      oldDocument.schoolId !== school.id ||
      oldDocument.organizationId !== school.organizationId ||
      school.status !== SchoolStatus.ACTIVE ||
      school.deletedAt ||
      school.organization.id !== oldDocument.organizationId ||
      school.organization.status !== OrganizationStatus.ACTIVE ||
      school.organization.deletedAt
    ) {
      throw new NotFoundDomainException('School not found', {
        requestId: oldDocument.requestId,
      });
    }
  }

  private assertRequestAllowsMutation(
    oldDocument: ApplicantAdmissionRequestDocumentMutationRecord,
  ): void {
    if (oldDocument.request.status === ApplicantAdmissionRequestStatus.DRAFT) {
      return;
    }

    if (
      oldDocument.request.status ===
        ApplicantAdmissionRequestStatus.SUBMITTED &&
      oldDocument.request.application?.status ===
        AdmissionApplicationStatus.DOCUMENTS_PENDING &&
      !oldDocument.request.application.deletedAt
    ) {
      return;
    }

    throw new DomainException({
      code: 'conflict',
      message: 'Applicant documents cannot be replaced in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details: { requestId: oldDocument.requestId },
    });
  }

  private assertDocumentCanBeReplaced(
    oldDocument: ApplicantAdmissionRequestDocumentMutationRecord,
  ): void {
    if (
      oldDocument.status === ApplicantAdmissionRequestDocumentStatus.SUPERSEDED
    ) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: oldDocument.requestId,
        documentId: oldDocument.id,
      });
    }

    if (
      oldDocument.status === ApplicantAdmissionRequestDocumentStatus.ACCEPTED ||
      oldDocument.applicationDocumentId
    ) {
      throw new DomainException({
        code: 'conflict',
        message: 'Applicant document cannot be replaced',
        httpStatus: HttpStatus.CONFLICT,
        details: { documentId: oldDocument.id },
      });
    }

    if (
      !REPLACEABLE_APPLICANT_DOCUMENT_STATUSES.includes(
        oldDocument.status as (typeof REPLACEABLE_APPLICANT_DOCUMENT_STATUSES)[number],
      )
    ) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: oldDocument.requestId,
        documentId: oldDocument.id,
      });
    }
  }

  private resolveBridgeApplicationId(
    oldDocument: ApplicantAdmissionRequestDocumentMutationRecord,
  ): string | null {
    if (
      oldDocument.request.status ===
        ApplicantAdmissionRequestStatus.SUBMITTED &&
      oldDocument.request.application?.id &&
      oldDocument.request.application.status ===
        AdmissionApplicationStatus.DOCUMENTS_PENDING &&
      !oldDocument.request.application.deletedAt
    ) {
      return oldDocument.request.application.id;
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
