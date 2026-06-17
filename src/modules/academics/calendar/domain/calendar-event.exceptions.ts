import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class CalendarEventNotFoundException extends DomainException {
  constructor(_details?: Record<string, unknown>) {
    super({
      code: 'academics.calendar_event.not_found',
      message: 'Academic calendar event was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class CalendarEventInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.calendar_event.invalid_scope',
      message: 'Academic calendar event scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CalendarEventInvalidDateRangeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.calendar_event.invalid_date_range',
      message: 'Academic calendar event start date must be before or equal to end date',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CalendarEventInvalidListRangeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.calendar_event.invalid_list_range',
      message: 'Academic calendar event list date range is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CalendarEventInvalidPayloadException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.calendar_event.invalid_payload',
      message: 'Academic calendar event payload is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
