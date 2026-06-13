import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAcademicsScope } from '../../academics-context';
import { UpdateCalendarEventDto } from '../dto/calendar-event.dto';
import { CalendarEventResponseDto } from '../dto/calendar-event-response.dto';
import { CalendarEventsRepository } from '../infrastructure/calendar-events.repository';
import { presentCalendarEvent } from '../presenters/calendar-event.presenter';
import {
  assertValidCalendarDateRange,
  findCalendarEventOrThrow,
  mapCalendarEventType,
  normalizeNullableText,
  normalizeRequiredTitle,
  parseCalendarDateTime,
  recordCalendarEventAudit,
  resolveUpdatedStorageScope,
  summarizeCalendarEvent,
  validateCalendarAcademicScope,
} from './calendar-event-use-case.helpers';

@Injectable()
export class UpdateCalendarEventUseCase {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    eventId: string,
    command: UpdateCalendarEventDto,
  ): Promise<CalendarEventResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await findCalendarEventOrThrow(
      this.calendarEventsRepository,
      eventId,
    );
    const academicYearId = command.academicYearId ?? existing.academicYearId;
    const termId = command.termId ?? existing.termId;
    await validateCalendarAcademicScope(this.calendarEventsRepository, {
      academicYearId,
      termId,
    });
    const startDate = command.startDate !== undefined
      ? parseCalendarDateTime(command.startDate, 'startDate')
      : existing.startDate;
    const endDate = command.endDate !== undefined
      ? parseCalendarDateTime(command.endDate, 'endDate')
      : existing.endDate;
    assertValidCalendarDateRange(startDate, endDate);
    const eventScope = await resolveUpdatedStorageScope(
      this.calendarEventsRepository,
      existing,
      command,
    );

    const data: Prisma.AcademicCalendarEventUncheckedUpdateInput = {
      academicYearId,
      termId,
      type:
        command.type !== undefined
          ? mapCalendarEventType(command.type)
          : existing.type,
      scopeType: eventScope.scopeType,
      scopeKey: eventScope.scopeKey,
      stageId: eventScope.stageId,
      gradeId: eventScope.gradeId,
      sectionId: eventScope.sectionId,
      allDay: command.allDay ?? existing.allDay,
      startDate,
      endDate,
      updatedByUserId: scope.actorId,
    };

    if (command.title !== undefined) {
      data.title = normalizeRequiredTitle(command.title);
    }
    if (command.description !== undefined) {
      data.description = normalizeNullableText(command.description);
    }
    if (command.notes !== undefined) {
      data.notes = normalizeNullableText(command.notes);
    }

    const event = await this.calendarEventsRepository.updateEvent(
      eventId,
      data,
    );

    await recordCalendarEventAudit(this.authRepository, {
      scope,
      action: 'academics.calendar_event.update',
      resourceId: event.id,
      before: summarizeCalendarEvent(existing),
      after: summarizeCalendarEvent(event),
    });

    return presentCalendarEvent(event);
  }
}
