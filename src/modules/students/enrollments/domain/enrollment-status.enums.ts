import { StudentEnrollmentStatus } from '@prisma/client';

export const STUDENT_ENROLLMENT_STATUS_API_VALUES = [
  'active',
  'completed',
  'withdrawn',
] as const;

export type StudentEnrollmentStatusApiValue =
  (typeof STUDENT_ENROLLMENT_STATUS_API_VALUES)[number];

export function mapEnrollmentStatusToApi(
  status: StudentEnrollmentStatus,
): StudentEnrollmentStatusApiValue {
  switch (status) {
    case StudentEnrollmentStatus.ACTIVE:
      return 'active';
    case StudentEnrollmentStatus.COMPLETED:
      return 'completed';
    case StudentEnrollmentStatus.WITHDRAWN:
      return 'withdrawn';
  }
}
