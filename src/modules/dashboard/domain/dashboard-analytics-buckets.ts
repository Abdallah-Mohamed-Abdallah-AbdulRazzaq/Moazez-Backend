import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { DashboardAnalyticsGranularity } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCalendarMonthPoint,
  dashboardAnalyticsCivilDatePoint,
  dashboardAnalyticsWeekIntervalPoint,
} from './dashboard-analytics-coordinate';
import { parseDashboardAnalyticsCivilDate } from './dashboard-analytics-query';
import { addDashboardCivilDays } from './dashboard-time-context';

export interface DashboardAnalyticsBucket {
  key: string;
  startDate: string;
  endDate: string;
  point(value: number): DashboardAnalyticsChartDataPoint;
}

export function buildDashboardAnalyticsBuckets(input: {
  granularity: DashboardAnalyticsGranularity;
  startCivilDate: string;
  endCivilDate: string;
}): DashboardAnalyticsBucket[] {
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

export function findDashboardAnalyticsBucket(
  buckets: readonly DashboardAnalyticsBucket[],
  civilDate: string,
): DashboardAnalyticsBucket | undefined {
  return buckets.find(
    (bucket) => civilDate >= bucket.startDate && civilDate <= bucket.endDate,
  );
}

function dayBuckets(
  startCivilDate: string,
  endCivilDate: string,
): DashboardAnalyticsBucket[] {
  const buckets: DashboardAnalyticsBucket[] = [];
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
): DashboardAnalyticsBucket[] {
  const buckets: DashboardAnalyticsBucket[] = [];
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
): DashboardAnalyticsBucket[] {
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
      'Dashboard analytics bucket range is invalid',
      { fields: ['startCivilDate', 'endCivilDate'] },
    );
  }
}
