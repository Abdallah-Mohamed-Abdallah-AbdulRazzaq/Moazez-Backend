import { OfficialResultsError } from './official-results.error';

export function parseReportingDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new OfficialResultsError('period.invalid_dates');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new OfficialResultsError('period.invalid_dates');
  }
  return date;
}

export function assertReportingDates(
  startsOn: Date,
  endsOn: Date,
  interval: { startDate: Date; endDate: Date },
): void {
  if (
    startsOn > endsOn ||
    startsOn < interval.startDate ||
    endsOn > interval.endDate
  ) {
    throw new OfficialResultsError('period.invalid_dates');
  }
}

export function assertRosterDate(
  rosterAsOf: Date,
  timezone: string,
  period: { startsOn: Date; endsOn: Date },
): void {
  if (!Number.isFinite(rosterAsOf.valueOf())) {
    throw new OfficialResultsError('period.invalid_dates');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(rosterAsOf);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const date = parseReportingDate(`${year}-${month}-${day}`);
  assertReportingDates(date, date, {
    startDate: period.startsOn,
    endDate: period.endsOn,
  });
}
