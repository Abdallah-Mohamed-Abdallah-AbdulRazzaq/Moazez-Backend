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
  const candidate =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; meta?: unknown })
      : null;
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034') ||
    candidate?.code === 'P2034' ||
    (candidate?.code === 'P2010' &&
      isPostgreSqlSerializationFailure(candidate.meta))
  );
}

function isPostgreSqlSerializationFailure(meta: unknown): boolean {
  return (
    typeof meta === 'object' &&
    meta !== null &&
    'code' in meta &&
    meta.code === '40001'
  );
}
