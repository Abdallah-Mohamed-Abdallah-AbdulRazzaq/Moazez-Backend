import { Injectable } from '@nestjs/common';
import { CalendarEventNotFoundException } from '../../domain/calendar-event.exceptions';
import { AppCalendarEventResponseDto } from '../dto/app-calendar-event-response.dto';
import { AppCalendarEventsRepository } from '../infrastructure/app-calendar-events.repository';
import { presentAppCalendarEvent } from '../presenters/app-calendar-event.presenter';
import type { AppCalendarVisibilityContext } from '../visibility/app-calendar-visibility.types';

@Injectable()
export class GetAppCalendarEventUseCase {
  constructor(
    private readonly appCalendarEventsRepository: AppCalendarEventsRepository,
  ) {}

  async execute(params: {
    eventId: string;
    visibility: AppCalendarVisibilityContext;
  }): Promise<AppCalendarEventResponseDto> {
    const event = await this.appCalendarEventsRepository.findVisibleEventById(
      params.eventId,
      params.visibility,
    );
    if (!event) {
      throw new CalendarEventNotFoundException({ eventId: params.eventId });
    }

    return presentAppCalendarEvent(event);
  }
}
