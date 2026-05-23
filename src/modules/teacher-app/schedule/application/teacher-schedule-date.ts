import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DEFAULT_TEACHER_SCHEDULE_WEEK_START_DAY = 0;

export interface TeacherScheduleDate {
  date: string;
  dayOfWeek: number;
  utcDate: Date;
}

export interface TeacherScheduleWeek {
  weekStartDate: string;
  weekEndDate: string;
  days: TeacherScheduleDate[];
}

export function parseTeacherScheduleDate(value: string): TeacherScheduleDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throwInvalidDate(value);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throwInvalidDate(value);
  }

  return {
    date: formatUtcDate(utcDate),
    dayOfWeek: utcDate.getUTCDay(),
    utcDate,
  };
}

export function buildTeacherScheduleWeek(
  date: TeacherScheduleDate,
  weekStartDay: number,
): TeacherScheduleWeek {
  if (
    !Number.isInteger(weekStartDay) ||
    weekStartDay < 0 ||
    weekStartDay > 6
  ) {
    throw new ValidationDomainException('Teacher schedule week start is invalid', {
      field: 'weekStartDay',
      weekStartDay,
    });
  }

  // Timetable Core stores dayOfWeek with the JavaScript convention:
  // Sunday = 0 through Saturday = 6.
  const daysSinceWeekStart = (date.dayOfWeek - weekStartDay + 7) % 7;
  const weekStart = addUtcDays(date.utcDate, -daysSinceWeekStart);
  const days = Array.from({ length: 7 }, (_, index) =>
    parseTeacherScheduleDate(formatUtcDate(addUtcDays(weekStart, index))),
  );

  return {
    weekStartDate: days[0].date,
    weekEndDate: days[6].date,
    days,
  };
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function throwInvalidDate(value: string): never {
  throw new ValidationDomainException('Teacher schedule date must be YYYY-MM-DD', {
    field: 'date',
    value,
  });
}
