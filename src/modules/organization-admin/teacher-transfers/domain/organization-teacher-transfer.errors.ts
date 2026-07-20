import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export const TEACHER_TRANSFER_REASON_CODES = [
  'same_school_transfer',
  'source_state_conflict',
  'source_membership_conflict',
  'destination_live_profile_exists',
  'destination_profile_history_ambiguous',
  'destination_membership_conflict',
  'destination_membership_history_ambiguous',
  'destination_teacher_role_required',
  'destination_teacher_code_conflict',
  'actor_scope_moved',
  'school_state_moved',
  'transfer_concurrency_conflict',
] as const;

export type TeacherTransferReasonCode =
  (typeof TEACHER_TRANSFER_REASON_CODES)[number];

export class TeacherTransferNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'teachers.lifecycle.transfer_not_found',
      message: 'Teacher transfer resource not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class TeacherTransferConflictException extends DomainException {
  constructor(reasonCode: TeacherTransferReasonCode) {
    super({
      code: 'teachers.lifecycle.transfer_conflict',
      message: 'Teacher transfer cannot be completed',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode },
    });
  }
}
