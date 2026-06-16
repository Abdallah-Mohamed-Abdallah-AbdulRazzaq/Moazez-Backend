import { CalendarEventInvalidScopeException } from '../../domain/calendar-event.exceptions';
import type { AppCalendarEventsQueryDto } from '../dto/app-calendar-events-query.dto';
import type { AppCalendarEventsRepository } from '../infrastructure/app-calendar-events.repository';
import type { AppCalendarVisibilityContext } from '../visibility/app-calendar-visibility.types';

export interface ResolvedAppCalendarAcademicFilters {
  academicYearId?: string;
  termId?: string;
}

export function resolveAppCalendarAcademicFilters(
  visibility: AppCalendarVisibilityContext,
  query: Pick<AppCalendarEventsQueryDto, 'academicYearId' | 'termId'>,
): ResolvedAppCalendarAcademicFilters {
  if (
    visibility.academicYearId &&
    query.academicYearId &&
    query.academicYearId !== visibility.academicYearId
  ) {
    throw new CalendarEventInvalidScopeException({
      academicYearId: query.academicYearId,
    });
  }

  if (
    visibility.termId &&
    query.termId &&
    query.termId !== visibility.termId
  ) {
    throw new CalendarEventInvalidScopeException({
      termId: query.termId,
    });
  }

  return {
    academicYearId: query.academicYearId ?? visibility.academicYearId,
    termId: query.termId ?? visibility.termId ?? undefined,
  };
}

export async function validateAppCalendarAcademicFilters(
  repository: AppCalendarEventsRepository,
  input: ResolvedAppCalendarAcademicFilters,
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
    ? await repository.findTermForSchoolYear(
        input.termId,
        input.academicYearId,
      )
    : await repository.findTermForSchool(input.termId);

  if (!term) {
    throw new CalendarEventInvalidScopeException({
      academicYearId: input.academicYearId ?? null,
      termId: input.termId,
    });
  }
}
