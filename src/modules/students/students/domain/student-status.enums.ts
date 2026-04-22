import { StudentStatus } from '@prisma/client';

export const STUDENT_STATUS_API_VALUES = [
  'Active',
  'Suspended',
  'Withdrawn',
] as const;

export type StudentStatusApiValue =
  (typeof STUDENT_STATUS_API_VALUES)[number];

export function mapStudentStatusToApi(
  status: StudentStatus,
): StudentStatusApiValue {
  switch (status) {
    case StudentStatus.ACTIVE:
      return 'Active';
    case StudentStatus.SUSPENDED:
      return 'Suspended';
    case StudentStatus.WITHDRAWN:
      return 'Withdrawn';
  }
}

export function mapStudentStatusFromApi(
  status: StudentStatusApiValue,
): StudentStatus {
  switch (status) {
    case 'Active':
      return StudentStatus.ACTIVE;
    case 'Suspended':
      return StudentStatus.SUSPENDED;
    case 'Withdrawn':
      return StudentStatus.WITHDRAWN;
  }
}
