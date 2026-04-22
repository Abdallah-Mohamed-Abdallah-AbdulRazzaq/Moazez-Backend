import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
} from '@prisma/client';

export const ADMISSION_DECISION_API_VALUES = [
  'accept',
  'waitlist',
  'reject',
] as const;

export type AdmissionDecisionApiValue =
  (typeof ADMISSION_DECISION_API_VALUES)[number];

export function mapAdmissionDecisionFromApi(
  value: AdmissionDecisionApiValue,
): AdmissionDecisionType {
  switch (value) {
    case 'accept':
      return AdmissionDecisionType.ACCEPT;
    case 'waitlist':
      return AdmissionDecisionType.WAITLIST;
    case 'reject':
      return AdmissionDecisionType.REJECT;
  }
}

export function mapAdmissionDecisionToApi(
  value: AdmissionDecisionType,
): AdmissionDecisionApiValue {
  switch (value) {
    case AdmissionDecisionType.ACCEPT:
      return 'accept';
    case AdmissionDecisionType.WAITLIST:
      return 'waitlist';
    case AdmissionDecisionType.REJECT:
      return 'reject';
  }
}

export function mapDecisionToApplicationStatus(
  decision: AdmissionDecisionType,
): AdmissionApplicationStatus {
  switch (decision) {
    case AdmissionDecisionType.ACCEPT:
      return AdmissionApplicationStatus.ACCEPTED;
    case AdmissionDecisionType.WAITLIST:
      return AdmissionApplicationStatus.WAITLISTED;
    case AdmissionDecisionType.REJECT:
      return AdmissionApplicationStatus.REJECTED;
  }
}
