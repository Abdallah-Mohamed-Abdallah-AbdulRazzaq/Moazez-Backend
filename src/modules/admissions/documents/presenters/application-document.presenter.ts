import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
} from '@prisma/client';
import { ApplicationDocumentResponseDto } from '../dto/application-document.dto';
import { ApplicationDocumentRecord } from '../infrastructure/application-documents.repository';
import { mapApplicationDocumentStatusToApi } from '../../applications/domain/application.enums';

const REVIEWABLE_APPLICATION_STATUSES = [
  AdmissionApplicationStatus.SUBMITTED,
  AdmissionApplicationStatus.DOCUMENTS_PENDING,
  AdmissionApplicationStatus.UNDER_REVIEW,
] as const;

export function isApplicationDocumentReviewableApplicationStatus(
  status: AdmissionApplicationStatus,
): boolean {
  return REVIEWABLE_APPLICATION_STATUSES.includes(
    status as (typeof REVIEWABLE_APPLICATION_STATUSES)[number],
  );
}

export function presentApplicationDocument(
  document: ApplicationDocumentRecord,
): ApplicationDocumentResponseDto {
  const linkedApplicantDocument = resolveLinkedApplicantDocument(document);
  const reviewEligibility = resolveDocumentReviewEligibility(
    document,
    linkedApplicantDocument,
  );
  const canReview = reviewEligibility.reason === 'reviewable';

  return {
    id: document.id,
    applicationId: document.applicationId,
    fileId: document.fileId,
    documentType: document.documentType,
    status: mapApplicationDocumentStatusToApi(document.status),
    source: linkedApplicantDocument ? 'applicant_portal' : 'staff_upload',
    canReview,
    reviewEligibility: {
      canAccept: canReview,
      canReject: canReview,
      canRequestReplacement: canReview,
      reason: reviewEligibility.reason,
    },
    linkedApplicantDocument: linkedApplicantDocument
      ? {
          id: linkedApplicantDocument.id,
          status: mapLinkedApplicantDocumentStatusToApi(
            linkedApplicantDocument.status,
          ),
        }
      : null,
    notes: document.notes,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    file: {
      id: document.file.id,
      originalName: document.file.originalName,
      mimeType: document.file.mimeType,
      sizeBytes: document.file.sizeBytes.toString(),
      visibility: document.file.visibility,
    },
  };
}

function resolveDocumentReviewEligibility(
  document: ApplicationDocumentRecord,
  linkedApplicantDocument:
    | ApplicationDocumentRecord['applicantAdmissionRequestDocuments'][number]
    | null,
): Pick<ApplicationDocumentResponseDto['reviewEligibility'], 'reason'> {
  if (
    !document.application?.status ||
    !isApplicationDocumentReviewableApplicationStatus(
      document.application.status,
    )
  ) {
    return { reason: 'application_status_not_reviewable' };
  }

  if (document.status !== AdmissionDocumentStatus.PENDING_REVIEW) {
    return { reason: 'document_not_pending_review' };
  }

  if (!linkedApplicantDocument) {
    return { reason: 'not_applicant_portal_document' };
  }

  if (
    linkedApplicantDocument.status !==
    ApplicantAdmissionRequestDocumentStatus.UPLOADED
  ) {
    return { reason: 'applicant_document_not_uploaded' };
  }

  return { reason: 'reviewable' };
}

function resolveLinkedApplicantDocument(
  document: ApplicationDocumentRecord,
):
  | ApplicationDocumentRecord['applicantAdmissionRequestDocuments'][number]
  | null {
  return (
    document.applicantAdmissionRequestDocuments.find(
      (candidate) => candidate.applicationDocumentId === document.id,
    ) ?? null
  );
}

function mapLinkedApplicantDocumentStatusToApi(
  status: ApplicantAdmissionRequestDocumentStatus,
): NonNullable<
  ApplicationDocumentResponseDto['linkedApplicantDocument']
>['status'] {
  switch (status) {
    case ApplicantAdmissionRequestDocumentStatus.UPLOADED:
      return 'uploaded';
    case ApplicantAdmissionRequestDocumentStatus.ACCEPTED:
      return 'accepted';
    case ApplicantAdmissionRequestDocumentStatus.REJECTED:
      return 'rejected';
    case ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT:
      return 'needs_replacement';
    case ApplicantAdmissionRequestDocumentStatus.SUPERSEDED:
      return 'superseded';
  }
}
