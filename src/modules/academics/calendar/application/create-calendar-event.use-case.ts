import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAcademicsScope } from '../../academics-context';
import { CreateCalendarEventDto } from '../dto/calendar-event.dto';
import { CalendarEventResponseDto } from '../dto/calendar-event-response.dto';
import { CalendarEventsRepository } from '../infrastructure/calendar-events.repository';
import { presentCalendarEvent } from '../presenters/calendar-event.presenter';
import {
  assertValidCalendarDateRange,
  mapCalendarEventScopeType,
  mapCalendarEventType,
  normalizeNullableText,
  normalizeRequiredTitle,
  parseCalendarDateTime,
  recordCalendarEventAudit,
  resolveStorageScope,
  summarizeCalendarEvent,
  validateCalendarAcademicScope,
} from './calendar-event-use-case.helpers';

@Injectable()
export class CreateCalendarEventUseCase {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateCalendarEventDto,
  ): Promise<CalendarEventResponseDto> {
    const scope = requireAcademicsScope();
    await validateCalendarAcademicScope(this.calendarEventsRepository, {
      academicYearId: command.academicYearId,
      termId: command.termId,
    });
    const startDate = parseCalendarDateTime(command.startDate, 'startDate');
    const endDate = parseCalendarDateTime(command.endDate, 'endDate');
    assertValidCalendarDateRange(startDate, endDate);
    const eventScope = await resolveStorageScope(
      this.calendarEventsRepository,
      mapCalendarEventScopeType(command.scopeType),
      command.scopeId,
    );

    const event = await this.calendarEventsRepository.createEvent({
      schoolId: scope.schoolId,
      academicYearId: command.academicYearId,
      termId: command.termId,
      title: normalizeRequiredTitle(command.title),
      description: normalizeNullableText(command.description),
      notes: normalizeNullableText(command.notes),
      type: mapCalendarEventType(command.type),
      scopeType: eventScope.scopeType,
      scopeKey: eventScope.scopeKey,
      stageId: eventScope.stageId,
      gradeId: eventScope.gradeId,
      sectionId: eventScope.sectionId,
      allDay: command.allDay ?? true,
      startDate,
      endDate,
      createdByUserId: scope.actorId,
      updatedByUserId: scope.actorId,
    });

    await recordCalendarEventAudit(this.authRepository, {
      scope,
      action: 'academics.calendar_event.create',
      resourceId: event.id,
      after: summarizeCalendarEvent(event),
    });

    return presentCalendarEvent(event);
  }
}
