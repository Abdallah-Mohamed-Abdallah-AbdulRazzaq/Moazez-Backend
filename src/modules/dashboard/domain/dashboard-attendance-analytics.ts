import { AttendanceExcuseStatus, AttendanceStatus } from '@prisma/client';
import {
  AttendanceDashboardDailyStatusAggregate,
  AttendanceDashboardExcuseStatusAggregate,
} from '../../attendance/reports/infrastructure/attendance-dashboard-analytics.repository';
import { DashboardAnalyticsAttendancePackChartKey } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCategoryPoint,
} from './dashboard-analytics-coordinate';
import { DashboardAnalyticsQueryContext } from './dashboard-analytics-query';
import {
  DashboardAttendanceAnalyticsBucket,
  buildDashboardAttendanceAnalyticsBuckets,
  findDashboardAttendanceAnalyticsBucket,
} from './dashboard-attendance-analytics-buckets';

export interface DashboardAttendanceAnalyticsData {
  series: readonly {
    key: string;
    label: string;
    points: readonly DashboardAnalyticsChartDataPoint[];
  }[];
  totals: Record<string, number>;
  summary: { value: number; label: string };
  empty: boolean;
}

const CONSIDERED_FINAL_STATUSES = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
  AttendanceStatus.EARLY_LEAVE,
] as const;

export function computeDashboardAttendanceAnalyticsData(input: {
  chartKey: DashboardAnalyticsAttendancePackChartKey;
  queryContext: DashboardAnalyticsQueryContext;
  dailyAggregates?: readonly AttendanceDashboardDailyStatusAggregate[];
  excuseAggregates?: readonly AttendanceDashboardExcuseStatusAggregate[];
}): DashboardAttendanceAnalyticsData {
  if (input.chartKey === 'attendance.excuse_status') {
    return excuseStatusData(input.excuseAggregates ?? []);
  }

  const buckets = buildDashboardAttendanceAnalyticsBuckets({
    granularity: input.queryContext.granularity,
    startCivilDate: input.queryContext.startCivilDate,
    endCivilDate: input.queryContext.endCivilDate,
  });
  const counts = aggregateIntoBuckets(buckets, input.dailyAggregates ?? []);

  switch (input.chartKey) {
    case 'attendance.daily_trend':
      return representedStatusData({
        buckets,
        counts,
        statuses: [
          [AttendanceStatus.PRESENT, 'present', 'Present'],
          [AttendanceStatus.ABSENT, 'absent', 'Absent'],
          [AttendanceStatus.LATE, 'late', 'Late'],
        ],
      });

    case 'attendance.status_distribution':
      return representedStatusData({
        buckets,
        counts,
        statuses: [
          [AttendanceStatus.PRESENT, 'present', 'Present'],
          [AttendanceStatus.ABSENT, 'absent', 'Absent'],
          [AttendanceStatus.LATE, 'late', 'Late'],
          [AttendanceStatus.EXCUSED, 'excused', 'Excused'],
        ],
      });

    case 'attendance.absence_rate':
      return rateData({
        buckets,
        counts,
        numeratorStatus: AttendanceStatus.ABSENT,
        seriesKey: 'absence_rate',
        seriesLabel: 'Absence rate',
        numeratorTotalKey: 'absent',
        summaryLabel: 'Overall absence rate',
      });

    case 'attendance.late_rate':
      return rateData({
        buckets,
        counts,
        numeratorStatus: AttendanceStatus.LATE,
        seriesKey: 'late_rate',
        seriesLabel: 'Late rate',
        numeratorTotalKey: 'late',
        summaryLabel: 'Overall late rate',
      });
  }
}

type BucketStatusCounts = Map<string, Map<AttendanceStatus, number>>;
type RepresentedStatus = readonly [AttendanceStatus, string, string];

function aggregateIntoBuckets(
  buckets: readonly DashboardAttendanceAnalyticsBucket[],
  rows: readonly AttendanceDashboardDailyStatusAggregate[],
): BucketStatusCounts {
  const counts: BucketStatusCounts = new Map(
    buckets.map((bucket) => [bucket.key, new Map()]),
  );

  for (const row of rows) {
    const bucket = findDashboardAttendanceAnalyticsBucket(buckets, row.date);
    if (!bucket) continue;
    const statusCounts = counts.get(bucket.key)!;
    statusCounts.set(
      row.status,
      (statusCounts.get(row.status) ?? 0) + row.count,
    );
  }

  return counts;
}

function representedStatusData(input: {
  buckets: readonly DashboardAttendanceAnalyticsBucket[];
  counts: BucketStatusCounts;
  statuses: readonly RepresentedStatus[];
}): DashboardAttendanceAnalyticsData {
  const totals: Record<string, number> = {};
  const series = input.statuses.map(([status, key, label]) => {
    const total = input.buckets.reduce(
      (sum, bucket) => sum + statusCount(input.counts, bucket.key, status),
      0,
    );
    totals[key] = total;
    return {
      key,
      label,
      points: input.buckets.map((bucket) =>
        bucket.point(statusCount(input.counts, bucket.key, status)),
      ),
    };
  });
  const representedTotal = Object.values(totals).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    series,
    totals,
    summary: {
      value: representedTotal,
      label: 'Attendance observations',
    },
    empty: representedTotal === 0,
  };
}

function rateData(input: {
  buckets: readonly DashboardAttendanceAnalyticsBucket[];
  counts: BucketStatusCounts;
  numeratorStatus: AttendanceStatus;
  seriesKey: string;
  seriesLabel: string;
  numeratorTotalKey: string;
  summaryLabel: string;
}): DashboardAttendanceAnalyticsData {
  let numeratorTotal = 0;
  let consideredTotal = 0;
  const points = input.buckets.map((bucket) => {
    const numerator = statusCount(
      input.counts,
      bucket.key,
      input.numeratorStatus,
    );
    const considered = CONSIDERED_FINAL_STATUSES.reduce(
      (sum, status) => sum + statusCount(input.counts, bucket.key, status),
      0,
    );
    numeratorTotal += numerator;
    consideredTotal += considered;
    return bucket.point(percentage(numerator, considered));
  });
  const rate = percentage(numeratorTotal, consideredTotal);

  return {
    series: [{ key: input.seriesKey, label: input.seriesLabel, points }],
    totals: {
      [input.numeratorTotalKey]: numeratorTotal,
      considered: consideredTotal,
      rate,
    },
    summary: { value: rate, label: input.summaryLabel },
    empty: consideredTotal === 0,
  };
}

function excuseStatusData(
  rows: readonly AttendanceDashboardExcuseStatusAggregate[],
): DashboardAttendanceAnalyticsData {
  const counts = new Map(rows.map((row) => [row.status, row.count]));
  const statuses = [
    [AttendanceExcuseStatus.PENDING, 'pending', 'Pending'],
    [AttendanceExcuseStatus.APPROVED, 'approved', 'Approved'],
    [AttendanceExcuseStatus.REJECTED, 'rejected', 'Rejected'],
  ] as const;
  const totals: Record<string, number> = {};
  const series = statuses.map(([status, key, label]) => {
    const value = counts.get(status) ?? 0;
    totals[key] = value;
    return {
      key,
      label,
      points: [dashboardAnalyticsCategoryPoint(key, label, value)],
    };
  });
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);

  return {
    series,
    totals,
    summary: { value: total, label: 'Attendance excuse requests' },
    empty: total === 0,
  };
}

function statusCount(
  counts: BucketStatusCounts,
  bucketKey: string,
  status: AttendanceStatus,
): number {
  return counts.get(bucketKey)?.get(status) ?? 0;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}
