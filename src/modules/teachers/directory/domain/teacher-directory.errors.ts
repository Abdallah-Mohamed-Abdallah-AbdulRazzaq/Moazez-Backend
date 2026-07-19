import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import type { TeacherProfileCompletenessField } from '../../profile/domain/teacher-profile.types';

export const TEACHER_IDENTITY_FIELDS = [
  'loginEmail',
  'username',
  'contactEmail',
  'phone',
] as const;

export type TeacherIdentityField = (typeof TEACHER_IDENTITY_FIELDS)[number];

export class TeacherProfileNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'teachers.profile.not_found',
      message: 'Teacher profile not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class TeacherProfileCodeConflictException extends DomainException {
  constructor() {
    super({
      code: 'teachers.profile.code_conflict',
      message: 'Teacher code conflicts with an existing profile',
      httpStatus: HttpStatus.CONFLICT,
      details: { field: 'teacherCode' },
    });
  }
}

export class TeacherProfileIncompleteException extends DomainException {
  constructor(missingFields: TeacherProfileCompletenessField[]) {
    super({
      code: 'teachers.profile.incomplete',
      message: 'Teacher profile is incomplete',
      httpStatus: HttpStatus.CONFLICT,
      details: { missingFields },
    });
  }
}

export class TeacherIdentityConflictException extends DomainException {
  constructor(fields: TeacherIdentityField[]) {
    super({
      code: 'teachers.account.identity_conflict',
      message: 'Teacher login or contact identity conflicts',
      httpStatus: HttpStatus.CONFLICT,
      details: { fields: [...new Set(fields)].sort() },
    });
  }
}

export class TeacherRoleRequiredException extends DomainException {
  constructor(
    reasonCode: 'exact_teacher_role_required' = 'exact_teacher_role_required',
  ) {
    super({
      code: 'teachers.account.teacher_role_required',
      message: 'An exact live Teacher role is required',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reasonCode },
    });
  }
}

export class TeacherRoleTransitionConflictException extends DomainException {
  constructor(
    reasonCode:
      | 'teacher_identity_inconsistent'
      | 'teacher_directory_provisioning_required'
      | 'teacher_promotion_requires_profile'
      | 'teacher_display_projection_managed' = 'teacher_identity_inconsistent',
  ) {
    super({
      code: 'teachers.account.role_transition_conflict',
      message: 'Teacher identity state is not safe for this operation',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode },
    });
  }
}
