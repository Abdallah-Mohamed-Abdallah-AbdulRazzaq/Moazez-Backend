import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class ApplicationSubmitConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'conflict',
      message: 'Application cannot be submitted from its current status',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class ApplicationNotAcceptedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'admissions.application.not_accepted',
      message: 'Cannot enroll a non-accepted application',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
