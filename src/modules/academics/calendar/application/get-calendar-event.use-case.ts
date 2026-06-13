import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { CalendarEventResponseDto } from '../dto/calendar-event-response.dto';
import { CalendarEventsRepository } from '../infrastructure/calendar-events.repository';
import { presentCalendarEvent } from '../presenters/calendar-event.presenter';
import { findCalendarEventOrThrow } from './calendar-event-use-case.helpers';

@Injectable()
export class GetCalendarEventUseCase {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
  ) {}

  async execute(eventId: string): Promise<CalendarEventResponseDto> {
    requireAcademicsScope();
    const event = await findCalendarEventOrThrow(
      this.calendarEventsRepository,
      eventId,
    );
    return presentCalendarEvent(event);
  }
}
