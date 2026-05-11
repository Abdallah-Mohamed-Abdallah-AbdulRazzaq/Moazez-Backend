import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentAccountAlreadyLinkedException extends DomainException {
  constructor(studentId: string) {
    super({
      code: 'students.account.already_linked',
      message: 'Student account is already linked',
      httpStatus: HttpStatus.CONFLICT,
      details: { studentId },
    });
  }
}

export class GuardianAccountAlreadyLinkedException extends DomainException {
  constructor(guardianId: string) {
    super({
      code: 'students.guardian.account_already_linked',
      message: 'Guardian account is already linked',
      httpStatus: HttpStatus.CONFLICT,
      details: { guardianId },
    });
  }
}

export class AccountUserAlreadyLinkedException extends DomainException {
  constructor(userId: string) {
    super({
      code: 'students.account.user_already_linked',
      message: 'User is already linked to another account',
      httpStatus: HttpStatus.CONFLICT,
      details: { userId },
    });
  }
}

export class AccountUserTypeMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.account.user_type_mismatch',
      message: 'User type does not match the requested account link',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class StudentRoleMissingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.account.student_role_missing',
      message: 'Student role is missing or invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class ParentRoleMissingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.account.parent_role_missing',
      message: 'Parent role is missing or invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
