import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class TimetableConfigNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.config_not_found',
      message: 'Timetable config was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TimetablePeriodNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.period_not_found',
      message: 'Timetable period was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TimetableInvalidTimeRangeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.invalid_time_range',
      message: 'Timetable period time range is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TimetablePeriodOverlapException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.period_overlap',
      message: 'Timetable period overlaps another period',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetablePeriodIndexTakenException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.period_index_taken',
      message: 'Timetable period index is already taken',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetablePeriodInUseException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.period_in_use',
      message: 'Timetable period is used by timetable entries',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetableClosedTermException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.closed_term',
      message: 'Term is closed for timetable changes',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetablePublishedLockedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.published_locked',
      message: 'Published timetable config cannot be changed directly',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetableEntryConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.entry_conflict',
      message: 'Timetable entry has a scheduling conflict',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetableTeacherConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.teacher_conflict',
      message: 'Teacher is already scheduled in this period',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TimetableRoomConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.room_conflict',
      message: 'Room is already scheduled in this period',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
