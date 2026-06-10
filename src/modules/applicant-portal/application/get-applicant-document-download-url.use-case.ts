import { Injectable } from '@nestjs/common';
import {
  ApplicantAdmissionRequestDocumentStatus,
  AuditOutcome,
  UserType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { FilesNotFoundException } from '../../files/uploads/domain/file-upload.exceptions';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

const DOWNLOADABLE_APPLICANT_DOCUMENT_STATUSES = [
  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
  ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
] as const;

@Injectable()
export class GetApplicantDocumentDownloadUrlUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly storageService: StorageService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(params: {
    requestId: string;
    documentId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<string> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const document =
      await this.applicantPortalRepository.findApplicantAdmissionRequestDocumentForDownload(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId: params.requestId,
          documentId: params.documentId,
        },
      );
    if (!document || !this.isDownloadableStatus(document.status)) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: params.requestId,
        documentId: params.documentId,
      });
    }

    if (document.file.deletedAt) {
      throw new FilesNotFoundException({ fileId: document.file.id });
    }

    const url = await this.storageService.createDownloadUrl({
      bucket: document.file.bucket,
      objectKey: document.file.objectKey,
      expiresInSeconds: 5 * 60,
      downloadFileName: document.file.originalName,
    });

    await this.authRepository.createAuditLog({
      actorId: applicantContext.applicantUserId,
      userType: UserType.APPLICANT,
      organizationId: document.organizationId,
      schoolId: document.schoolId,
      module: 'applicant_portal',
      action: 'applicant.document.download',
      resourceType: 'applicant_admission_request_document',
      resourceId: document.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      after: {
        requestId: document.requestId,
        fileId: document.file.id,
        status: 'signed_url_created',
      },
    });

    return url;
  }

  private isDownloadableStatus(
    status: ApplicantAdmissionRequestDocumentStatus,
  ): boolean {
    return DOWNLOADABLE_APPLICANT_DOCUMENT_STATUSES.includes(
      status as (typeof DOWNLOADABLE_APPLICANT_DOCUMENT_STATUSES)[number],
    );
  }
}
