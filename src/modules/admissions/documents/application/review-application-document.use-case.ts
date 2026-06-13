import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
  AuditOutcome,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireApplicationsScope } from '../../applications/applications-scope';
import {
  mapApplicationDocumentStatusToApi,
  mapApplicationStatusToApi,
} from '../../applications/domain/application.enums';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import {
  ApplicationDocumentResponseDto,
  RequireApplicationDocumentReviewNoteDto,
  ReviewApplicationDocumentDto,
} from '../dto/application-document.dto';
import {
  ApplicationDocumentReviewRecord,
  ApplicationDocumentsRepository,
  LinkedApplicantDocumentReviewRecord,
} from '../infrastructure/application-documents.repository';
import { presentApplicationDocument } from '../presenters/application-document.presenter';

type ReviewAction = 'accept' | 'reject' | 'request_replacement';

const REVIEWABLE_APPLICATION_STATUSES = [
  AdmissionApplicationStatus.SUBMITTED,
  AdmissionApplicationStatus.DOCUMENTS_PENDING,
  AdmissionApplicationStatus.UNDER_REVIEW,
] as const;

@Injectable()
export class ReviewApplicationDocumentUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationDocumentsRepository: ApplicationDocumentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  accept(
    applicationId: string,
    documentId: string,
    command: ReviewApplicationDocumentDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.review({
      action: 'accept',
      applicationId,
      documentId,
      note: normalizeOptionalNote(command.note),
      nextApplicationDocumentStatus: AdmissionDocumentStatus.COMPLETE,
      nextApplicantDocumentStatus:
        ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
      reopenApplicationDocuments: false,
    });
  }

  reject(
    applicationId: string,
    documentId: string,
    command: RequireApplicationDocumentReviewNoteDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.review({
      action: 'reject',
      applicationId,
      documentId,
      note: normalizeRequiredNote(command.note),
      nextApplicationDocumentStatus: AdmissionDocumentStatus.MISSING,
      nextApplicantDocumentStatus:
        ApplicantAdmissionRequestDocumentStatus.REJECTED,
      reopenApplicationDocuments: false,
    });
  }

  requestReplacement(
    applicationId: string,
    documentId: string,
    command: RequireApplicationDocumentReviewNoteDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.review({
      action: 'request_replacement',
      applicationId,
      documentId,
      note: normalizeRequiredNote(command.note),
      nextApplicationDocumentStatus: AdmissionDocumentStatus.MISSING,
      nextApplicantDocumentStatus:
        ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
      reopenApplicationDocuments: true,
    });
  }

  private async review(params: {
    action: ReviewAction;
    applicationId: string;
    documentId: string;
    note?: string | null;
    nextApplicationDocumentStatus: AdmissionDocumentStatus;
    nextApplicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus;
    reopenApplicationDocuments: boolean;
  }): Promise<ApplicationDocumentResponseDto> {
    const scope = requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(
        params.applicationId,
      );
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId: params.applicationId,
      });
    }
    this.assertApplicationCanBeReviewed(application.status, application.id);

    const document =
      await this.applicationDocumentsRepository.findApplicantBridgedApplicationDocument(
        {
          applicationId: params.applicationId,
          documentId: params.documentId,
        },
      );
    if (!document) {
      throw new NotFoundDomainException('Application document not found', {
        applicationId: params.applicationId,
        documentId: params.documentId,
      });
    }

    const applicantDocument = this.resolveReviewableApplicantDocument(document);
    this.assertDocumentCanBeReviewed(document);

    const result =
      await this.applicationDocumentsRepository.reviewApplicantApplicationDocument(
        {
          schoolId: scope.schoolId,
          applicationId: params.applicationId,
          documentId: params.documentId,
          applicantDocumentId: applicantDocument.id,
          nextApplicationDocumentStatus: params.nextApplicationDocumentStatus,
          nextApplicantDocumentStatus: params.nextApplicantDocumentStatus,
          note: params.note,
          reopenApplicationDocuments: params.reopenApplicationDocuments,
        },
      );

    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Application document not found', {
        applicationId: params.applicationId,
        documentId: params.documentId,
      });
    }
    if (result.status === 'invalid_state') {
      throw this.reviewConflict(params.documentId);
    }

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'admissions',
      action: `admissions.document.${params.action}`,
      resourceType: 'application_document',
      resourceId: params.documentId,
      outcome: AuditOutcome.SUCCESS,
      before: {
        applicationId: params.applicationId,
        applicationDocumentId: params.documentId,
        applicantDocumentId: applicantDocument.id,
        fileId: document.fileId,
        requiredDocumentId: applicantDocument.requiredDocumentId,
        previousApplicationDocumentStatus: mapApplicationDocumentStatusToApi(
          document.status,
        ),
        previousApplicantDocumentStatus: applicantDocument.status.toLowerCase(),
        applicationStatusBefore: mapApplicationStatusToApi(application.status),
      },
      after: {
        applicationId: params.applicationId,
        applicationDocumentId: params.documentId,
        applicantDocumentId: applicantDocument.id,
        fileId: document.fileId,
        requiredDocumentId: applicantDocument.requiredDocumentId,
        nextApplicationDocumentStatus: mapApplicationDocumentStatusToApi(
          params.nextApplicationDocumentStatus,
        ),
        nextApplicantDocumentStatus:
          params.nextApplicantDocumentStatus.toLowerCase(),
        applicationStatusAfter: mapApplicationStatusToApi(
          result.applicationStatusAfter,
        ),
        reasonProvided: params.note !== null && params.note !== undefined,
      },
    });

    return presentApplicationDocument(result.document);
  }

  private assertApplicationCanBeReviewed(
    status: AdmissionApplicationStatus,
    applicationId: string,
  ): void {
    if (
      !REVIEWABLE_APPLICATION_STATUSES.includes(
        status as (typeof REVIEWABLE_APPLICATION_STATUSES)[number],
      )
    ) {
      throw new DomainException({
        code: 'conflict',
        message: 'Application documents cannot be reviewed in the current state',
        httpStatus: HttpStatus.CONFLICT,
        details: { applicationId },
      });
    }
  }

  private assertDocumentCanBeReviewed(
    document: ApplicationDocumentReviewRecord,
  ): void {
    if (document.status !== AdmissionDocumentStatus.PENDING_REVIEW) {
      throw this.reviewConflict(document.id);
    }
  }

  private resolveReviewableApplicantDocument(
    document: ApplicationDocumentReviewRecord,
  ): LinkedApplicantDocumentReviewRecord {
    const applicantDocument = document.applicantAdmissionRequestDocuments.find(
      (candidate) =>
        candidate.applicationDocumentId === document.id &&
        candidate.status === ApplicantAdmissionRequestDocumentStatus.UPLOADED,
    );

    if (!applicantDocument) {
      throw this.reviewConflict(document.id);
    }

    return applicantDocument;
  }

  private reviewConflict(documentId: string): DomainException {
    return new DomainException({
      code: 'conflict',
      message: 'Application document cannot be reviewed in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details: { documentId },
    });
  }
}

function normalizeOptionalNote(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRequiredNote(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationDomainException('A review note is required', {
      field: 'note',
    });
  }

  return trimmed;
}
