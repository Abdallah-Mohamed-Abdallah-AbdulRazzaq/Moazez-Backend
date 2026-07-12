import { DashboardAnalyticsGranularity } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCalendarMonthPoint,
  dashboardAnalyticsCivilDatePoint,
  dashboardAnalyticsWeekIntervalPoint,
} from './dashboard-analytics-coordinate';
import { parseDashboardAnalyticsCivilDate } from './dashboard-analytics-query';
import { addDashboardCivilDays } from './dashboard-time-context';

export interface DashboardAttendanceAnalyticsBucket {
  key: string;
  startDate: string;
  endDate: string;
  point(value: number): DashboardAnalyticsChartDataPoint;
}

export function buildDashboardAttendanceAnalyticsBuckets(input: {
  granularity: DashboardAnalyticsGranularity;
  startCivilDate: string;
  endCivilDate: string;
}): DashboardAttendanceAnalyticsBucket[] {
  validateRange(input.startCivilDate, input.endCivilDate);

  switch (input.granularity) {
    case 'day':
      return dayBuckets(input.startCivilDate, input.endCivilDate);
    case 'week':
      return weekBuckets(input.startCivilDate, input.endCivilDate);
    case 'month':
      return monthBuckets(input.startCivilDate, input.endCivilDate);
  }
}

export function findDashboardAttendanceAnalyticsBucket(
  buckets: readonly DashboardAttendanceAnalyticsBucket[],
  civilDate: string,
): DashboardAttendanceAnalyticsBucket | undefined {
  return buckets.find(
    (bucket) => civilDate >= bucket.startDate && civilDate <= bucket.endDate,
  );
}

function dayBuckets(
  startCivilDate: string,
  endCivilDate: string,
): DashboardAttendanceAnalyticsBucket[] {
  const buckets: DashboardAttendanceAnalyticsBucket[] = [];
  for (
    let date = startCivilDate;
    date <= endCivilDate;
    date = addDashboardCivilDays(date, 1)
  ) {
    buckets.push({
      key: date,
      startDate: date,
      endDate: date,
      point: (value) => dashboardAnalyticsCivilDatePoint(date, value),
    });
  }
  return buckets;
}

function weekBuckets(
  startCivilDate: string,
  endCivilDate: string,
): DashboardAttendanceAnalyticsBucket[] {
  const buckets: DashboardAttendanceAnalyticsBucket[] = [];
  let cursor = startCivilDate;

  while (cursor <= endCivilDate) {
    const weekday = parseDashboardAnalyticsCivilDate(
      cursor,
      'bucket.startDate',
    ).getUTCDay();
    const daysUntilSunday = 6 - ((weekday + 6) % 7);
    const naturalEnd = addDashboardCivilDays(cursor, daysUntilSunday);
    const bucketEnd = naturalEnd < endCivilDate ? naturalEnd : endCivilDate;
    const startDate = cursor;
    const endDate = bucketEnd;

    buckets.push({
      key: `${startDate}/${endDate}`,
      startDate,
      endDate,
      point: (value) =>
        dashboardAnalyticsWeekIntervalPoint(startDate, endDate, value),
    });
    cursor = addDashboardCivilDays(bucketEnd, 1);
  }

  return buckets;
}

function monthBuckets(
  startCivilDate: string,
  endCivilDate: string,
): DashboardAttendanceAnalyticsBucket[] {
  const boundaries = new Map<string, { startDate: string; endDate: string }>();
  for (
    let date = startCivilDate;
    date <= endCivilDate;
    date = addDashboardCivilDays(date, 1)
  ) {
    const month = date.slice(0, 7);
    const existing = boundaries.get(month);
    boundaries.set(month, {
      startDate: existing?.startDate ?? date,
      endDate: date,
    });
  }

  return [...boundaries.entries()].map(([month, boundary]) => ({
    key: month,
    startDate: boundary.startDate,
    endDate: boundary.endDate,
    point: (value) => dashboardAnalyticsCalendarMonthPoint(month, value),
  }));
}

function validateRange(startCivilDate: string, endCivilDate: string): void {
  parseDashboardAnalyticsCivilDate(startCivilDate, 'bucket.startCivilDate');
  parseDashboardAnalyticsCivilDate(endCivilDate, 'bucket.endCivilDate');
  if (startCivilDate > endCivilDate) {
    throw new ValidationDomainException(
      'Dashboard attendance bucket range is invalid',
      { fields: ['startCivilDate', 'endCivilDate'] },
    );
  }
}
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
