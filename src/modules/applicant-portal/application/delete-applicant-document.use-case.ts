import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  ApplicantAdmissionRequestDocumentStatus,
  ApplicantAdmissionRequestStatus,
  AuditOutcome,
  OrganizationStatus,
  SchoolStatus,
  UserType,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  ApplicantAdmissionRequestDocumentMutationRecord,
  ApplicantPortalRepository,
} from '../infrastructure/applicant-portal.repository';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

export interface DeleteApplicantDocumentCommand {
  requestId: string;
  documentId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class DeleteApplicantDocumentUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: DeleteApplicantDocumentCommand): Promise<void> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const document =
      await this.applicantPortalRepository.findApplicantAdmissionRequestDocumentForMutation(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId: command.requestId,
          documentId: command.documentId,
        },
      );
    if (!document) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: command.requestId,
        documentId: command.documentId,
      });
    }

    this.assertRequestSchoolIsSafe(document);
    this.assertRequestAllowsMutation(document);
    this.assertDocumentCanBeDeleted(document);

    const deleted =
      await this.applicantPortalRepository.softDeleteApplicantAdmissionRequestDocument(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId: command.requestId,
          documentId: command.documentId,
          deletedAt: new Date(),
        },
      );
    if (!deleted) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: command.requestId,
        documentId: command.documentId,
      });
    }

    await this.authRepository.createAuditLog({
      actorId: applicantContext.applicantUserId,
      userType: UserType.APPLICANT,
      organizationId: document.organizationId,
      schoolId: document.schoolId,
      module: 'applicant_portal',
      action: 'applicant.document.delete',
      resourceType: 'applicant_admission_request_document',
      resourceId: document.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      after: {
        requestId: document.requestId,
        documentId: document.id,
        fileId: document.fileId,
        status: 'soft_deleted',
      },
    });
  }

  private assertRequestSchoolIsSafe(
    document: ApplicantAdmissionRequestDocumentMutationRecord,
  ): void {
    const school = document.request.school;
    if (
      document.schoolId !== school.id ||
      document.organizationId !== school.organizationId ||
      school.status !== SchoolStatus.ACTIVE ||
      school.deletedAt ||
      school.organization.id !== document.organizationId ||
      school.organization.status !== OrganizationStatus.ACTIVE ||
      school.organization.deletedAt
    ) {
      throw new NotFoundDomainException('School not found', {
        requestId: document.requestId,
      });
    }
  }

  private assertRequestAllowsMutation(
    document: ApplicantAdmissionRequestDocumentMutationRecord,
  ): void {
    if (document.request.status === ApplicantAdmissionRequestStatus.DRAFT) {
      return;
    }

    if (
      document.request.status === ApplicantAdmissionRequestStatus.SUBMITTED &&
      document.request.application?.status ===
        AdmissionApplicationStatus.DOCUMENTS_PENDING &&
      !document.request.application.deletedAt
    ) {
      return;
    }

    throw new DomainException({
      code: 'conflict',
      message: 'Applicant documents cannot be deleted in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details: { requestId: document.requestId },
    });
  }

  private assertDocumentCanBeDeleted(
    document: ApplicantAdmissionRequestDocumentMutationRecord,
  ): void {
    if (
      document.status === ApplicantAdmissionRequestDocumentStatus.SUPERSEDED
    ) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: document.requestId,
        documentId: document.id,
      });
    }

    if (
      document.status === ApplicantAdmissionRequestDocumentStatus.ACCEPTED ||
      document.applicationDocumentId
    ) {
      throw new DomainException({
        code: 'conflict',
        message: 'Applicant document cannot be deleted',
        httpStatus: HttpStatus.CONFLICT,
        details: { documentId: document.id },
      });
    }
  }
}
