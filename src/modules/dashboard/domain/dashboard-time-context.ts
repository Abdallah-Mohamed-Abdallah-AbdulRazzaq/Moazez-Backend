const DEFAULT_DASHBOARD_TIMEZONE = 'UTC';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEARCH_MARGIN_MS = 36 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export interface DashboardTimeContext {
  generatedAt: Date;
  timezone: string;
  civilDate: string;
  todayDate: Date;
  todayStart: Date;
  todayEndExclusive: Date;
  last7DaysStart: Date;
  last30DaysStart: Date;
  next7DaysEndExclusive: Date;
}

export interface BuildDashboardTimeContextInput {
  generatedAt: Date;
  explicitTimezone?: string | null;
  schoolTimezone?: string | null;
}

export function buildDashboardTimeContext(
  input: BuildDashboardTimeContextInput,
): DashboardTimeContext {
  const generatedAt = new Date(input.generatedAt.getTime());
  const timezone = resolveDashboardTimezone(
    input.explicitTimezone,
    input.schoolTimezone,
  );
  const civilDate = formatDashboardCivilDate(generatedAt, timezone);

  return {
    generatedAt,
    timezone,
    civilDate,
    todayDate: dashboardCivilDateToPrismaDate(civilDate),
    todayStart: startOfDashboardCivilDate(civilDate, timezone),
    todayEndExclusive: startOfDashboardCivilDate(
      addDashboardCivilDays(civilDate, 1),
      timezone,
    ),
    last7DaysStart: startOfDashboardCivilDate(
      addDashboardCivilDays(civilDate, -7),
      timezone,
    ),
    last30DaysStart: startOfDashboardCivilDate(
      addDashboardCivilDays(civilDate, -30),
      timezone,
    ),
    next7DaysEndExclusive: new Date(generatedAt.getTime() + SEVEN_DAYS_MS),
  };
}

export function resolveDashboardTimezone(
  explicitTimezone: string | null | undefined,
  schoolTimezone: string | null | undefined,
): string {
  const explicit = normalizeOptionalText(explicitTimezone);
  if (explicit && isValidDashboardTimezone(explicit)) return explicit;

  const school = normalizeOptionalText(schoolTimezone);
  if (school && isValidDashboardTimezone(school)) return school;

  return DEFAULT_DASHBOARD_TIMEZONE;
}

export function isValidDashboardTimezone(timezone: string): boolean {
  try {
    dashboardDateFormatter(timezone).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function formatDashboardCivilDate(date: Date, timezone: string): string {
  const parts = dashboardDateFormatter(timezone).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
}

export function startOfDashboardCivilDate(
  civilDate: string,
  timezone: string,
): Date {
  const dateValue = dashboardCivilDateToPrismaDate(civilDate).getTime();
  let low = dateValue - SEARCH_MARGIN_MS;
  let high = dateValue + SEARCH_MARGIN_MS;

  while (low < high) {
    const midpoint = low + Math.floor((high - low) / 2);
    if (formatDashboardCivilDate(new Date(midpoint), timezone) < civilDate) {
      low = midpoint + 1;
    } else {
      high = midpoint;
    }
  }

  return new Date(low);
}

export function dashboardCivilDateToPrismaDate(civilDate: string): Date {
  const { year, month, day } = parseDashboardCivilDate(civilDate);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDashboardCivilDays(civilDate: string, days: number): string {
  const date = dashboardCivilDateToPrismaDate(civilDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function dashboardDateFormatter(timezone: string): Intl.DateTimeFormat {
  const existing = dateFormatters.get(timezone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  dateFormatters.set(timezone, formatter);
  return formatter;
}

function parseDashboardCivilDate(civilDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_ONLY_PATTERN.exec(civilDate);
  if (!match) throw new RangeError('Dashboard civil date must be YYYY-MM-DD');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError('Dashboard civil date must be a valid calendar date');
  }

  return { year, month, day };
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
