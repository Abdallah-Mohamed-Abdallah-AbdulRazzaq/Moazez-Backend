import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  AuditOutcome,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import type { AcademicsScope } from '../../academics-context';
import {
  CalendarEventScopeTypeDto,
  CalendarEventTypeDto,
} from '../dto/calendar-event.dto';
import {
  CalendarEventInvalidDateRangeException,
  CalendarEventInvalidListRangeException,
  CalendarEventInvalidPayloadException,
  CalendarEventInvalidScopeException,
  CalendarEventNotFoundException,
} from '../domain/calendar-event.exceptions';
import type {
  CalendarEventRecord,
  CalendarEventsRepository,
} from '../infrastructure/calendar-events.repository';
import {
  toCalendarEventScopeTypeDto,
  toCalendarEventTypeDto,
} from '../presenters/calendar-event.presenter';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_RANGE_DAYS = 90;
const MAX_LIST_RANGE_DAYS = 370;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

const EVENT_TYPE_TO_PRISMA = {
  [CalendarEventTypeDto.HOLIDAY]: AcademicCalendarEventType.HOLIDAY,
  [CalendarEventTypeDto.EXAM]: AcademicCalendarEventType.EXAM,
  [CalendarEventTypeDto.ACTIVITY]: AcademicCalendarEventType.ACTIVITY,
  [CalendarEventTypeDto.OTHER]: AcademicCalendarEventType.OTHER,
} satisfies Record<CalendarEventTypeDto, AcademicCalendarEventType>;

const SCOPE_TYPE_TO_PRISMA = {
  [CalendarEventScopeTypeDto.SCHOOL]: AcademicCalendarEventScopeType.SCHOOL,
  [CalendarEventScopeTypeDto.STAGE]: AcademicCalendarEventScopeType.STAGE,
  [CalendarEventScopeTypeDto.GRADE]: AcademicCalendarEventScopeType.GRADE,
  [CalendarEventScopeTypeDto.SECTION]:
    AcademicCalendarEventScopeType.SECTION,
} satisfies Record<CalendarEventScopeTypeDto, AcademicCalendarEventScopeType>;

export interface ResolvedCalendarScope {
  scopeType: AcademicCalendarEventScopeType;
  scopeId: string | null;
  scopeKey: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
}

export interface CalendarListWindow {
  from: Date;
  to: Date;
  limit: number;
}

interface CalendarEventAuditInput {
  scope: AcademicsScope;
  action: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export function mapCalendarEventType(
  type: CalendarEventTypeDto,
): AcademicCalendarEventType {
  return EVENT_TYPE_TO_PRISMA[type];
}

export function mapCalendarEventScopeType(
  scopeType: CalendarEventScopeTypeDto,
): AcademicCalendarEventScopeType {
  return SCOPE_TYPE_TO_PRISMA[scopeType];
}

export function normalizeRequiredTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw new CalendarEventInvalidPayloadException({ field: 'title' });
  }

  return normalized;
}

export function normalizeNullableText(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseCalendarDateTime(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CalendarEventInvalidDateRangeException({ [field]: value });
  }

  return date;
}

export function assertValidCalendarDateRange(
  startDate: Date,
  endDate: Date,
): void {
  if (startDate.getTime() > endDate.getTime()) {
    throw new CalendarEventInvalidDateRangeException({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }
}

export function normalizeCalendarListWindow(input: {
  from?: string;
  to?: string;
  limit?: number;
}): CalendarListWindow {
  const from = input.from !== undefined
    ? parseCalendarDateTime(input.from, 'from')
    : input.to !== undefined
      ? addDays(parseCalendarDateTime(input.to, 'to'), -DEFAULT_LIST_RANGE_DAYS)
      : startOfTodayUtc();
  const to = input.to !== undefined
    ? parseCalendarDateTime(input.to, 'to')
    : addDays(from, DEFAULT_LIST_RANGE_DAYS);

  if (from.getTime() > to.getTime()) {
    throw new CalendarEventInvalidListRangeException({
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }

  if (to.getTime() - from.getTime() > MAX_LIST_RANGE_DAYS * MS_PER_DAY) {
    throw new CalendarEventInvalidListRangeException({
      from: from.toISOString(),
      to: to.toISOString(),
      maxDays: MAX_LIST_RANGE_DAYS,
    });
  }

  const requestedLimit = Number.isFinite(input.limit)
    ? Math.trunc(input.limit as number)
    : DEFAULT_LIST_LIMIT;
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIST_LIMIT);

  return { from, to, limit };
}

export async function validateCalendarAcademicScope(
  repository: CalendarEventsRepository,
  input: {
    academicYearId: string;
    termId: string;
  },
): Promise<void> {
  const academicYear = await repository.findAcademicYearForSchool(
    input.academicYearId,
  );
  if (!academicYear) {
    throw new CalendarEventInvalidScopeException({
      academicYearId: input.academicYearId,
    });
  }

  const term = await repository.findTermForSchoolYear(
    input.termId,
    input.academicYearId,
  );
  if (!term) {
    throw new CalendarEventInvalidScopeException({
      academicYearId: input.academicYearId,
      termId: input.termId,
    });
  }
}

export async function validateCalendarListAcademicFilters(
  repository: CalendarEventsRepository,
  input: {
    academicYearId?: string;
    termId?: string;
  },
): Promise<void> {
  if (input.academicYearId) {
    const academicYear = await repository.findAcademicYearForSchool(
      input.academicYearId,
    );
    if (!academicYear) {
      throw new CalendarEventInvalidScopeException({
        academicYearId: input.academicYearId,
      });
    }
  }

  if (!input.termId) {
    return;
  }

  const term = input.academicYearId
    ? await repository.findTermForSchoolYear(input.termId, input.academicYearId)
    : await repository.findTermForSchool(input.termId);
  if (!term) {
    throw new CalendarEventInvalidScopeException({
      academicYearId: input.academicYearId ?? null,
      termId: input.termId,
    });
  }
}

export async function resolveStorageScope(
  repository: CalendarEventsRepository,
  scopeType: AcademicCalendarEventScopeType,
  scopeId?: string | null,
): Promise<ResolvedCalendarScope> {
  if (scopeType === AcademicCalendarEventScopeType.SCHOOL) {
    if (scopeId) {
      throw new CalendarEventInvalidScopeException({
        scopeType,
        scopeId,
      });
    }

    return {
      scopeType,
      scopeId: null,
      scopeKey: null,
      stageId: null,
      gradeId: null,
      sectionId: null,
    };
  }

  if (!scopeId) {
    throw new CalendarEventInvalidScopeException({ scopeType });
  }

  if (scopeType === AcademicCalendarEventScopeType.STAGE) {
    const stage = await repository.findStageForSchool(scopeId);
    if (!stage) {
      throw new CalendarEventInvalidScopeException({ scopeType, scopeId });
    }

    return {
      scopeType,
      scopeId,
      scopeKey: scopeId,
      stageId: scopeId,
      gradeId: null,
      sectionId: null,
    };
  }

  if (scopeType === AcademicCalendarEventScopeType.GRADE) {
    const grade = await repository.findGradeForSchool(scopeId);
    if (!grade) {
      throw new CalendarEventInvalidScopeException({ scopeType, scopeId });
    }

    return {
      scopeType,
      scopeId,
      scopeKey: scopeId,
      stageId: null,
      gradeId: scopeId,
      sectionId: null,
    };
  }

  const section = await repository.findSectionForSchool(scopeId);
  if (!section) {
    throw new CalendarEventInvalidScopeException({ scopeType, scopeId });
  }

  return {
    scopeType,
    scopeId,
    scopeKey: scopeId,
    stageId: null,
    gradeId: null,
    sectionId: scopeId,
  };
}

export async function resolveListScopeFilter(
  repository: CalendarEventsRepository,
  input: {
    scopeType?: CalendarEventScopeTypeDto;
    scopeId?: string | null;
  },
): Promise<{
  scopeType?: AcademicCalendarEventScopeType;
  scopeKey?: string | null;
}> {
  if (!input.scopeType) {
    if (input.scopeId) {
      throw new CalendarEventInvalidScopeException({
        scopeId: input.scopeId,
      });
    }

    return {};
  }

  const scopeType = mapCalendarEventScopeType(input.scopeType);
  const scope = await resolveStorageScope(repository, scopeType, input.scopeId);
  return {
    scopeType: scope.scopeType,
    scopeKey: scope.scopeKey,
  };
}

export async function resolveUpdatedStorageScope(
  repository: CalendarEventsRepository,
  existing: CalendarEventRecord,
  input: {
    scopeType?: CalendarEventScopeTypeDto;
    scopeId?: string | null;
  },
): Promise<ResolvedCalendarScope> {
  const scopeType = input.scopeType
    ? mapCalendarEventScopeType(input.scopeType)
    : existing.scopeType;
  let scopeId: string | null | undefined;

  if (input.scopeId !== undefined) {
    scopeId = input.scopeId;
  } else if (input.scopeType && scopeType !== existing.scopeType) {
    scopeId =
      scopeType === AcademicCalendarEventScopeType.SCHOOL ? null : undefined;
  } else {
    scopeId = existing.scopeKey ?? null;
  }

  return resolveStorageScope(repository, scopeType, scopeId);
}

export async function findCalendarEventOrThrow(
  repository: CalendarEventsRepository,
  eventId: string,
): Promise<CalendarEventRecord> {
  const event = await repository.findEventById(eventId);
  if (!event) {
    throw new CalendarEventNotFoundException({ eventId });
  }

  return event;
}

export function summarizeCalendarEvent(
  event: CalendarEventRecord,
): Record<string, unknown> {
  return {
    id: event.id,
    academicYearId: event.academicYearId,
    termId: event.termId,
    type: toCalendarEventTypeDto(event.type),
    scopeType: toCalendarEventScopeTypeDto(event.scopeType),
    scopeId: event.scopeKey ?? null,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    allDay: event.allDay,
    deletedAt: event.deletedAt?.toISOString() ?? null,
  };
}

export function recordCalendarEventAudit(
  authRepository: AuthRepository,
  input: CalendarEventAuditInput,
): Promise<unknown> {
  return authRepository.createAuditLog({
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'academics',
    action: input.action,
    resourceType: 'academic_calendar_event',
    resourceId: input.resourceId,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: input.after,
  });
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}
