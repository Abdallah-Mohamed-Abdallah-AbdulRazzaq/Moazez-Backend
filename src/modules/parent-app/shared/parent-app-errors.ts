import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class ParentAppRequiredParentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent_app.actor.required_parent',
      message: 'Parent App requires an active parent membership',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class ParentAppGuardianNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent_app.guardian.not_found',
      message: 'Parent App guardian was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class ParentAppChildNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent_app.child.not_found',
      message: 'Parent App child was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class ParentAppEnrollmentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent_app.enrollment.not_found',
      message: 'Parent App active enrollment was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class ParentAppClassroomNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent_app.classroom.not_found',
      message: 'Parent App classroom was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}
