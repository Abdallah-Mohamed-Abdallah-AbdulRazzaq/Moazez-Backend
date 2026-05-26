import {
  LessonPlanInvalidItemScopeException,
  LessonPlanInvalidScopeException,
} from './lesson-plan.exceptions';

export function normalizeRequiredTitle(value: string, field = 'title'): string {
  const title = value.trim();
  if (title.length === 0) {
    throw new LessonPlanInvalidScopeException({ field });
  }

  return title;
}

export function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeDateOnly(value: string, field: string): Date {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new LessonPlanInvalidScopeException({ field, value });
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new LessonPlanInvalidScopeException({ field, value });
  }

  return date;
}

export function assertDateRange(startDate: Date, endDate: Date): void {
  if (startDate.getTime() > endDate.getTime()) {
    throw new LessonPlanInvalidScopeException({
      field: 'weekStartDate',
      weekStartDate: startDate.toISOString(),
      weekEndDate: endDate.toISOString(),
    });
  }
}

export function assertDateWithinRange(
  value: Date,
  startDate: Date,
  endDate: Date,
  field = 'plannedDate',
): void {
  const time = value.getTime();
  if (time < startDate.getTime() || time > endDate.getTime()) {
    throw new LessonPlanInvalidItemScopeException({
      field,
      plannedDate: value.toISOString(),
      weekStartDate: startDate.toISOString(),
      weekEndDate: endDate.toISOString(),
    });
  }
}

export function dayOfWeekFromDate(value: Date): number {
  return value.getUTCDay();
}

export function assertDayOfWeek(value: number | null | undefined): void {
  if (value === undefined || value === null) {
    return;
  }

  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new LessonPlanInvalidScopeException({ field: 'dayOfWeek', value });
  }
}

export function assertSortOrder(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new LessonPlanInvalidScopeException({ field: 'sortOrder', value });
  }
}
