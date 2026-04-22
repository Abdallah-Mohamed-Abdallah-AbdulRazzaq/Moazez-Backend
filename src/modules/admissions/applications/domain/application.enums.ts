import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
} from '@prisma/client';

export const APPLICATION_SOURCE_API_VALUES = [
  'in_app',
  'referral',
  'walk_in',
  'other',
] as const;

export const APPLICATION_STATUS_API_VALUES = [
  'submitted',
  'documents_pending',
  'under_review',
  'accepted',
  'waitlisted',
  'rejected',
] as const;

export const APPLICATION_DOCUMENT_STATUS_API_VALUES = [
  'complete',
  'missing',
] as const;

export type ApplicationSourceApiValue =
  (typeof APPLICATION_SOURCE_API_VALUES)[number];
export type ApplicationStatusApiValue =
  (typeof APPLICATION_STATUS_API_VALUES)[number];
export type ApplicationDocumentStatusApiValue =
  (typeof APPLICATION_DOCUMENT_STATUS_API_VALUES)[number];

export function mapApplicationSourceFromApi(
  value: ApplicationSourceApiValue,
): AdmissionApplicationSource {
  switch (value) {
    case 'in_app':
      return AdmissionApplicationSource.IN_APP;
    case 'referral':
      return AdmissionApplicationSource.REFERRAL;
    case 'walk_in':
      return AdmissionApplicationSource.WALK_IN;
    case 'other':
      return AdmissionApplicationSource.OTHER;
  }
}

export function mapApplicationSourceToApi(
  value: AdmissionApplicationSource,
): ApplicationSourceApiValue {
  switch (value) {
    case AdmissionApplicationSource.IN_APP:
      return 'in_app';
    case AdmissionApplicationSource.REFERRAL:
      return 'referral';
    case AdmissionApplicationSource.WALK_IN:
      return 'walk_in';
    case AdmissionApplicationSource.OTHER:
      return 'other';
  }
}

export function mapApplicationStatusFromApi(
  value: ApplicationStatusApiValue,
): AdmissionApplicationStatus {
  switch (value) {
    case 'submitted':
      return AdmissionApplicationStatus.SUBMITTED;
    case 'documents_pending':
      return AdmissionApplicationStatus.DOCUMENTS_PENDING;
    case 'under_review':
      return AdmissionApplicationStatus.UNDER_REVIEW;
    case 'accepted':
      return AdmissionApplicationStatus.ACCEPTED;
    case 'waitlisted':
      return AdmissionApplicationStatus.WAITLISTED;
    case 'rejected':
      return AdmissionApplicationStatus.REJECTED;
  }
}

export function mapApplicationStatusToApi(
  value: AdmissionApplicationStatus,
): ApplicationStatusApiValue {
  switch (value) {
    case AdmissionApplicationStatus.SUBMITTED:
      return 'submitted';
    case AdmissionApplicationStatus.DOCUMENTS_PENDING:
      return 'documents_pending';
    case AdmissionApplicationStatus.UNDER_REVIEW:
      return 'under_review';
    case AdmissionApplicationStatus.ACCEPTED:
      return 'accepted';
    case AdmissionApplicationStatus.WAITLISTED:
      return 'waitlisted';
    case AdmissionApplicationStatus.REJECTED:
      return 'rejected';
  }
}

export function mapApplicationDocumentStatusFromApi(
  value: ApplicationDocumentStatusApiValue,
): AdmissionDocumentStatus {
  switch (value) {
    case 'complete':
      return AdmissionDocumentStatus.COMPLETE;
    case 'missing':
      return AdmissionDocumentStatus.MISSING;
  }
}

export function mapApplicationDocumentStatusToApi(
  value: AdmissionDocumentStatus,
): ApplicationDocumentStatusApiValue {
  switch (value) {
    case AdmissionDocumentStatus.COMPLETE:
      return 'complete';
    case AdmissionDocumentStatus.MISSING:
      return 'missing';
  }
}
