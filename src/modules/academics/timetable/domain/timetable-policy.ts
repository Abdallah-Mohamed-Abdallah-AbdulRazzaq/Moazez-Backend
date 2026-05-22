import {
  TimetableConfigStatus,
  TimetableScopeType,
} from '@prisma/client';
import {
  TimetableClosedTermException,
  TimetablePublishedLockedException,
} from './timetable.exceptions';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export const DEFAULT_TIMETABLE_ACTIVE_DAYS = [0, 1, 2, 3, 4];
export const DEFAULT_TIMETABLE_SCOPE_TYPE = TimetableScopeType.TERM;

export function normalizeActiveDays(input?: number[]): number[] {
  const days = input ?? DEFAULT_TIMETABLE_ACTIVE_DAYS;
  const unique = [...new Set(days)].sort((left, right) => left - right);

  if (
    unique.length === 0 ||
    unique.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new ValidationDomainException('Timetable active days are invalid', {
      field: 'activeDays',
      activeDays: input,
    });
  }

  return unique;
}

export function assertWeekStartDayIsValid(weekStartDay: number): void {
  if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
    throw new ValidationDomainException('Timetable week start day is invalid', {
      field: 'weekStartDay',
      weekStartDay,
    });
  }
}

export function assertTermWritable(term: { id: string; isActive: boolean }): void {
  if (!term.isActive) {
    throw new TimetableClosedTermException({ termId: term.id });
  }
}

export function assertConfigMutable(config: {
  id: string;
  status: TimetableConfigStatus;
}): void {
  if (config.status !== TimetableConfigStatus.DRAFT) {
    throw new TimetablePublishedLockedException({
      timetableConfigId: config.id,
      status: config.status,
    });
  }
}
