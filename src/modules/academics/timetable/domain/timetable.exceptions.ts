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

export class TimetableEntryNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.entry_not_found',
      message: 'Timetable entry was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TimetableInvalidDayException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.invalid_day',
      message: 'Timetable entry day is not active for this config',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TimetablePeriodNotInConfigException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.period_not_in_config',
      message: 'Timetable period does not belong to this config',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TimetableClassroomScopeMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.classroom_scope_mismatch',
      message: 'Classroom is outside this timetable config scope',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TimetableClassroomNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.classroom_not_found',
      message: 'Timetable classroom was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TimetableAllocationMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.allocation_mismatch',
      message: 'Teacher allocation does not match this timetable entry',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TimetableAllocationNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.allocation_not_found',
      message: 'Timetable teacher allocation was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TimetableRoomNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.room_not_found',
      message: 'Timetable room was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TimetableEntryNotMutableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.timetable.entry_not_mutable',
      message: 'Timetable entry cannot be changed in its current state',
      httpStatus: HttpStatus.CONFLICT,
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
