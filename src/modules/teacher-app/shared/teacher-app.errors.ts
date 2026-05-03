import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class TeacherAppRequiredTeacherException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.actor.required_teacher',
      message: 'Teacher App requires an active teacher membership',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class TeacherAppAllocationNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.allocation.not_found',
      message: 'Teacher App class allocation was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TeacherAppAllocationForbiddenException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.allocation.forbidden',
      message: 'Teacher does not own this class allocation',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}
