import {
  Prisma,
  type TeacherEmploymentStatus,
  type UserStatus,
} from '@prisma/client';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import { TeacherLifecycleUserInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import {
  TeacherLifecycleInvalidTransitionException,
  TeacherLifecycleRevocationFailedException,
  TeacherLifecycleSessionRevocationError,
  type TeacherLifecycleTransitionValue,
} from '../domain/teacher-lifecycle.errors';

export function rethrowTeacherLifecycleTransactionError(
  error: unknown,
  previousValue: TeacherLifecycleTransitionValue,
  nextValue: TeacherLifecycleTransitionValue,
): never {
  if (error instanceof TeacherLifecycleSessionRevocationError) {
    throw new TeacherLifecycleRevocationFailedException();
  }
  if (
    error instanceof TeacherLifecycleMembershipInvariantError ||
    error instanceof TeacherLifecycleUserInvariantError ||
    error instanceof TeacherProfileLifecycleInvariantError ||
    isTeacherLifecycleSerializationConflict(error)
  ) {
    throw new TeacherLifecycleInvalidTransitionException(
      previousValue as TeacherEmploymentStatus | UserStatus,
      nextValue as TeacherEmploymentStatus | UserStatus,
      'lifecycle_state_moved',
    );
  }
  throw error;
}

export function isTeacherLifecycleSerializationConflict(
  error: unknown,
): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034')
  );
}
