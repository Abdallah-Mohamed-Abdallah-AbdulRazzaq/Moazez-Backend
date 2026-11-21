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
  const date = parseReportingDate(
    formattedSchoolDate(schoolDateFormatter(timezone), rosterAsOf),
  );
  assertReportingDates(date, date, {
    startDate: period.startsOn,
    endDate: period.endsOn,
  });
}

function schoolDateFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formattedSchoolDate(
  formatter: Intl.DateTimeFormat,
  instant: Date | number,
) {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return parts.year + '-' + parts.month + '-' + parts.day;
}

export function currentRosterInstant(
  snapshot: Date,
  endDate: Date,
  timezone: string,
  now = new Date(),
): Date {
  const formatter = schoolDateFormatter(timezone);
  const date = (instant: Date | number) =>
    formattedSchoolDate(formatter, instant);
  const end = endDate.toISOString().slice(0, 10);
  if (date(now) <= end) return now < snapshot ? snapshot : now;
  const day = 86_400_000;
  let first = endDate.valueOf() - 2 * day;
  let last = endDate.valueOf() + 2 * day;
  while (last - first > 1) {
    const middle = Math.floor((first + last) / 2);
    if (date(middle) <= end) first = middle;
    else last = middle;
  }
  return new Date(first);
}
