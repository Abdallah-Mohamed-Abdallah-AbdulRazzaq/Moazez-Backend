import { AcademicCalendarEventScopeType } from '@prisma/client';
import {
  AppCalendarEventResponseDto,
  AppCalendarEventsListResponseDto,
} from '../dto/app-calendar-event-response.dto';
import type { AppCalendarEventRecord } from '../infrastructure/app-calendar-events.repository';
import {
  toCalendarEventScopeTypeDto,
  toCalendarEventTypeDto,
} from '../../presenters/calendar-event.presenter';

function resolveScopeId(event: AppCalendarEventRecord): string | null {
  switch (event.scopeType) {
    case AcademicCalendarEventScopeType.SCHOOL:
      return null;
    case AcademicCalendarEventScopeType.STAGE:
      return event.stageId ?? event.scopeKey ?? null;
    case AcademicCalendarEventScopeType.GRADE:
      return event.gradeId ?? event.scopeKey ?? null;
    case AcademicCalendarEventScopeType.SECTION:
      return event.sectionId ?? event.scopeKey ?? null;
  }
}

export function presentAppCalendarEvent(
  event: AppCalendarEventRecord,
): AppCalendarEventResponseDto {
  return {
    id: event.id,
    academicYearId: event.academicYearId,
    termId: event.termId,
    title: event.title,
    description: event.description ?? null,
    type: toCalendarEventTypeDto(event.type),
    scope: {
      type: toCalendarEventScopeTypeDto(event.scopeType),
      id: resolveScopeId(event),
    },
    allDay: event.allDay,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
  };
}

export function presentAppCalendarEvents(
  events: AppCalendarEventRecord[],
  nextCursor: string | null,
): AppCalendarEventsListResponseDto {
  return {
    items: events.map((event) => presentAppCalendarEvent(event)),
    nextCursor,
  };
}
