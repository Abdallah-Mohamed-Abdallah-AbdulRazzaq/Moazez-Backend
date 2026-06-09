import { Prisma, StudentEnrollmentStatus, StudentStatus } from '@prisma/client';

export const ACTIVE_STUDENT_SEAT_CALCULATION = 'active_students' as const;

export type ActiveStudentSeatCalculation =
  typeof ACTIVE_STUDENT_SEAT_CALCULATION;

export function buildActiveStudentSeatWhere(
  extra?: Prisma.EnrollmentWhereInput,
): Prisma.EnrollmentWhereInput {
  return {
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: {
      status: StudentStatus.ACTIVE,
      deletedAt: null,
    },
    ...(extra ?? {}),
  };
}
