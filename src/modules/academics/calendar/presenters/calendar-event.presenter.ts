import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
} from '@prisma/client';
import {
  CalendarEventScopeTypeDto,
  CalendarEventTypeDto,
} from '../dto/calendar-event.dto';
import {
  CalendarEventResponseDto,
  CalendarEventsListResponseDto,
} from '../dto/calendar-event-response.dto';
import type { CalendarEventRecord } from '../infrastructure/calendar-events.repository';

const EVENT_TYPE_TO_DTO = {
  [AcademicCalendarEventType.HOLIDAY]: CalendarEventTypeDto.HOLIDAY,
  [AcademicCalendarEventType.EXAM]: CalendarEventTypeDto.EXAM,
  [AcademicCalendarEventType.ACTIVITY]: CalendarEventTypeDto.ACTIVITY,
  [AcademicCalendarEventType.OTHER]: CalendarEventTypeDto.OTHER,
} satisfies Record<AcademicCalendarEventType, CalendarEventTypeDto>;

const SCOPE_TYPE_TO_DTO = {
  [AcademicCalendarEventScopeType.SCHOOL]: CalendarEventScopeTypeDto.SCHOOL,
  [AcademicCalendarEventScopeType.STAGE]: CalendarEventScopeTypeDto.STAGE,
  [AcademicCalendarEventScopeType.GRADE]: CalendarEventScopeTypeDto.GRADE,
  [AcademicCalendarEventScopeType.SECTION]: CalendarEventScopeTypeDto.SECTION,
} satisfies Record<AcademicCalendarEventScopeType, CalendarEventScopeTypeDto>;

export function toCalendarEventTypeDto(
  type: AcademicCalendarEventType,
): CalendarEventTypeDto {
  return EVENT_TYPE_TO_DTO[type];
}

export function toCalendarEventScopeTypeDto(
  scopeType: AcademicCalendarEventScopeType,
): CalendarEventScopeTypeDto {
  return SCOPE_TYPE_TO_DTO[scopeType];
}

function resolveScopeId(event: CalendarEventRecord): string | null {
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

export function presentCalendarEvent(
  event: CalendarEventRecord,
): CalendarEventResponseDto {
  return {
    id: event.id,
    academicYearId: event.academicYearId,
    termId: event.termId,
    title: event.title,
    description: event.description ?? null,
    notes: event.notes ?? null,
    type: toCalendarEventTypeDto(event.type),
    scope: {
      type: toCalendarEventScopeTypeDto(event.scopeType),
      id: resolveScopeId(event),
    },
    allDay: event.allDay,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export function presentCalendarEvents(
  events: CalendarEventRecord[],
  nextCursor: string | null,
): CalendarEventsListResponseDto {
  return {
    items: events.map((event) => presentCalendarEvent(event)),
    nextCursor,
  };
}
