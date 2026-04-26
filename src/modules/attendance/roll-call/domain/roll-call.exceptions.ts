import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class AttendanceSessionAlreadySubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.session.already_submitted',
      message: 'Session is already submitted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
