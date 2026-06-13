import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteCalendarEventResponseDto } from '../dto/calendar-event-response.dto';
import { CalendarEventNotFoundException } from '../domain/calendar-event.exceptions';
import { CalendarEventsRepository } from '../infrastructure/calendar-events.repository';
import {
  recordCalendarEventAudit,
  summarizeCalendarEvent,
} from './calendar-event-use-case.helpers';

@Injectable()
export class DeleteCalendarEventUseCase {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(eventId: string): Promise<DeleteCalendarEventResponseDto> {
    const scope = requireAcademicsScope();
    const result = await this.calendarEventsRepository.softDeleteEvent(
      eventId,
      scope.actorId,
    );
    if (result.status === 'not_found') {
      throw new CalendarEventNotFoundException({ eventId });
    }

    await recordCalendarEventAudit(this.authRepository, {
      scope,
      action: 'academics.calendar_event.delete',
      resourceId: result.event.id,
      after: summarizeCalendarEvent(result.event),
    });

    return {
      id: result.event.id,
      deleted: true,
    };
  }
}
