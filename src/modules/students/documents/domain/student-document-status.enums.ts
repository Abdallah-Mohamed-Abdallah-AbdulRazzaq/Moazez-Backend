import { StudentDocumentStatus } from '@prisma/client';

export const STUDENT_DOCUMENT_STATUS_API_VALUES = [
  'complete',
  'missing',
] as const;

export type StudentDocumentStatusApiValue =
  (typeof STUDENT_DOCUMENT_STATUS_API_VALUES)[number];

export function mapStudentDocumentStatusToApi(
  status: StudentDocumentStatus,
): StudentDocumentStatusApiValue {
  switch (status) {
    case StudentDocumentStatus.COMPLETE:
      return 'complete';
    case StudentDocumentStatus.MISSING:
      return 'missing';
  }
}

export function mapStudentDocumentStatusFromApi(
  status: StudentDocumentStatusApiValue,
): StudentDocumentStatus {
  switch (status) {
    case 'complete':
      return StudentDocumentStatus.COMPLETE;
    case 'missing':
      return StudentDocumentStatus.MISSING;
  }
}
