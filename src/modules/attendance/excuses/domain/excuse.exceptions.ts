import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class AttendanceExcuseInvalidDateRangeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.excuse.invalid_date_range',
      message: 'Invalid attendance excuse date range',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class AttendanceExcuseAlreadyReviewedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.excuse.already_reviewed',
      message: 'Attendance excuse request is already reviewed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class AttendanceExcuseInvalidMinutesException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.excuse.invalid_minutes',
      message: 'Invalid attendance excuse minutes',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class AttendanceExcuseInvalidPeriodSelectionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.excuse.invalid_period_selection',
      message: 'Invalid attendance excuse period selection',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class AttendanceExcuseNoMatchingSubmittedEntryException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'validation.failed',
      message: 'No matching submitted attendance entry exists for this excuse',
      httpStatus: HttpStatus.BAD_REQUEST,
      details,
    });
  }
}

export class AttendanceEntryRequiresExcuseAttachmentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.entry.requires_excuse_attachment',
      message: 'This policy requires an attachment for excuses',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
