import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentEnrollmentAlreadyWithdrawnException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.enrollment.already_withdrawn',
      message: 'Student is already withdrawn',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
