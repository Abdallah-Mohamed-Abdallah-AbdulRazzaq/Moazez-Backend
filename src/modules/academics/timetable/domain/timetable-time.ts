import {
  TimetableInvalidTimeRangeException,
  TimetablePeriodOverlapException,
} from './timetable.exceptions';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface TimetableTimeRange {
  startTime: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
}

export function parseTimetableTime(value: string, field: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new TimetableInvalidTimeRangeException({
      field,
      value,
      expectedFormat: 'HH:mm',
    });
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateTimetableTimeRange(input: {
  startTime: string;
  endTime: string;
}): TimetableTimeRange {
  const startMinute = parseTimetableTime(input.startTime, 'startTime');
  const endMinute = parseTimetableTime(input.endTime, 'endTime');

  if (startMinute >= endMinute) {
    throw new TimetableInvalidTimeRangeException({
      startTime: input.startTime,
      endTime: input.endTime,
    });
  }

  return {
    startTime: input.startTime,
    endTime: input.endTime,
    startMinute,
    endMinute,
  };
}

export function assertNoPeriodOverlap(
  candidate: TimetableTimeRange & { periodId?: string },
  existing: Array<{
    id: string;
    startTime: string;
    endTime: string;
    periodIndex: number;
  }>,
): void {
  const overlap = existing
    .filter((period) => period.id !== candidate.periodId)
    .find((period) => {
      const existingStart = parseTimetableTime(period.startTime, 'startTime');
      const existingEnd = parseTimetableTime(period.endTime, 'endTime');
      return (
        candidate.startMinute < existingEnd && existingStart < candidate.endMinute
      );
    });

  if (overlap) {
    throw new TimetablePeriodOverlapException({
      conflictingPeriodId: overlap.id,
      conflictingPeriodIndex: overlap.periodIndex,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
    });
  }
}
