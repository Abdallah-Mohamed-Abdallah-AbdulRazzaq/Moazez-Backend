import { HttpStatus } from '@nestjs/common';
import type { TeacherEmploymentStatus, UserStatus } from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export type TeacherLifecycleTransitionValue =
  | TeacherEmploymentStatus
  | UserStatus;

export type TeacherLifecycleInvalidTransitionReason =
  | 'invalid_employment_edge'
  | 'teacher_activation_requires_lifecycle'
  | 'teacher_identity_inconsistent'
  | 'credential_required'
  | 'lifecycle_state_moved';

export class TeacherLifecycleInvalidTransitionException extends DomainException {
  constructor(
    previousValue: TeacherLifecycleTransitionValue,
    nextValue: TeacherLifecycleTransitionValue,
    reasonCode: TeacherLifecycleInvalidTransitionReason,
  ) {
    super({
      code: 'teachers.lifecycle.invalid_transition',
      message: 'Teacher lifecycle transition is not allowed',
      httpStatus: HttpStatus.CONFLICT,
      details: { previousValue, nextValue, reasonCode },
    });
  }
}

export class TeacherLifecycleRevocationFailedException extends DomainException {
  constructor() {
    super({
      code: 'teachers.lifecycle.revocation_failed',
      message: 'Required Teacher session revocation did not complete',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      details: { retryable: true, reasonCode: 'revocation_failed' },
    });
  }
}

export class TeacherLifecycleIdentityStateException extends DomainException {
  constructor() {
    super({
      code: 'teachers.account.role_transition_conflict',
      message: 'Teacher identity state is not safe for this operation',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode: 'teacher_identity_inconsistent' },
    });
  }
}

export class TeacherLifecycleSessionRevocationError extends Error {
  constructor() {
    super('Teacher lifecycle session revocation failed');
    this.name = 'TeacherLifecycleSessionRevocationError';
  }
}
