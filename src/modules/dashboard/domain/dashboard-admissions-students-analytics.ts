import { AdmissionApplicationStatus } from '@prisma/client';
import {
  DashboardApplicationEventAggregate,
  DashboardApplicationStatusAggregate,
} from '../infrastructure/dashboard-admissions-analytics.repository';
import {
  DashboardEnrollmentStockAggregate,
  DashboardEnrollmentStockEvaluation,
  DashboardGuardianCoverageAggregate,
  DashboardWithdrawalAggregate,
} from '../infrastructure/dashboard-students-analytics.repository';
import {
  DashboardAnalyticsAdmissionsStudentsPackChartKey,
  DashboardAnalyticsGranularity,
} from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsBucket,
  buildDashboardAnalyticsBuckets,
  findDashboardAnalyticsBucket,
} from './dashboard-analytics-buckets';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCategoryPoint,
} from './dashboard-analytics-coordinate';
import { DashboardAnalyticsQueryContext } from './dashboard-analytics-query';
import {
  addDashboardCivilDays,
  formatDashboardCivilDate,
  startOfDashboardCivilDate,
} from './dashboard-time-context';

export interface DashboardAdmissionsStudentsAnalyticsData {
  series: readonly {
    key: string;
    label: string;
    points: readonly DashboardAnalyticsChartDataPoint[];
  }[];
  totals: Record<string, number>;
  summary: { value: number; label: string };
  empty: boolean;
}

export interface DashboardEnrollmentStockPlan {
  buckets: readonly DashboardAnalyticsBucket[];
  evaluations: readonly DashboardEnrollmentStockEvaluation[];
}

export function buildDashboardEnrollmentStockPlan(
  context: DashboardAnalyticsQueryContext,
): DashboardEnrollmentStockPlan {
  const currentCivilDate = formatDashboardCivilDate(
    context.generatedAt,
    context.timezone,
  );
  const endCivilDate =
    context.endCivilDate < currentCivilDate
      ? context.endCivilDate
      : currentCivilDate;

  if (context.startCivilDate > endCivilDate) {
    return { buckets: [], evaluations: [] };
  }

  const buckets = buildDashboardAnalyticsBuckets({
    granularity: context.granularity,
    startCivilDate: context.startCivilDate,
    endCivilDate,
  });
  const evaluations = buckets.flatMap((bucket) => {
    const bucketStart = startOfDashboardCivilDate(
      bucket.startDate,
      context.timezone,
    );
    if (bucketStart.getTime() > context.generatedAt.getTime()) return [];

    const bucketEndExclusive = startOfDashboardCivilDate(
      addDashboardCivilDays(bucket.endDate, 1),
      context.timezone,
    );
    const completed =
      bucketEndExclusive.getTime() <= context.generatedAt.getTime();
    return [
      {
        key: bucket.key,
        instant: completed ? bucketEndExclusive : context.generatedAt,
        kind: completed
          ? ('completed_bucket' as const)
          : ('current_partial' as const),
      },
    ];
  });

  return {
    buckets: buckets.filter((bucket) =>
      evaluations.some((evaluation) => evaluation.key === bucket.key),
    ),
    evaluations,
  };
}

export function computeDashboardAdmissionsStudentsAnalyticsData(input: {
  chartKey: DashboardAnalyticsAdmissionsStudentsPackChartKey;
  queryContext: DashboardAnalyticsQueryContext;
  applicationStatusAggregates?: readonly DashboardApplicationStatusAggregate[];
  applicationEventAggregates?: readonly DashboardApplicationEventAggregate[];
  enrollmentStockAggregates?: readonly DashboardEnrollmentStockAggregate[];
  enrollmentStockPlan?: DashboardEnrollmentStockPlan;
  withdrawalAggregates?: readonly DashboardWithdrawalAggregate[];
  guardianCoverage?: DashboardGuardianCoverageAggregate;
}): DashboardAdmissionsStudentsAnalyticsData {
  switch (input.chartKey) {
    case 'admissions.applications_by_status':
      return applicationStatusData(input.applicationStatusAggregates ?? []);
    case 'admissions.applications_over_time':
      return applicationEventData(
        input.queryContext,
        input.applicationEventAggregates ?? [],
      );
    case 'students.enrollment_growth':
      return enrollmentStockData(
        input.enrollmentStockPlan ??
          buildDashboardEnrollmentStockPlan(input.queryContext),
        input.enrollmentStockAggregates ?? [],
      );
    case 'students.withdrawal_trend':
      return withdrawalData(
        input.queryContext,
        input.withdrawalAggregates ?? [],
      );
    case 'students.guardian_coverage':
      return guardianCoverageData(
        input.guardianCoverage ?? { covered: 0, missing: 0 },
      );
  }
}

function applicationStatusData(
  rows: readonly DashboardApplicationStatusAggregate[],
): DashboardAdmissionsStudentsAnalyticsData {
  const counts = new Map(rows.map((row) => [row.status, row.count]));
  const statuses = [
    [
      AdmissionApplicationStatus.DOCUMENTS_PENDING,
      'documents_pending',
      'Documents pending',
    ],
    [AdmissionApplicationStatus.SUBMITTED, 'submitted', 'Submitted'],
    [AdmissionApplicationStatus.UNDER_REVIEW, 'under_review', 'Under review'],
    [AdmissionApplicationStatus.ACCEPTED, 'accepted', 'Accepted'],
    [AdmissionApplicationStatus.REJECTED, 'rejected', 'Rejected'],
    [AdmissionApplicationStatus.WAITLISTED, 'waitlisted', 'Waitlisted'],
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
  const total = sumTotals(totals);

  return {
    series,
    totals,
    summary: { value: total, label: 'Applications' },
    empty: total === 0,
  };
}

function applicationEventData(
  context: DashboardAnalyticsQueryContext,
  rows: readonly DashboardApplicationEventAggregate[],
): DashboardAdmissionsStudentsAnalyticsData {
  const buckets = queryBuckets(context);
  const counts = aggregateRowsByBucket(
    buckets,
    rows.map((row) => ({ date: row.date, key: row.event, count: row.count })),
  );
  const submitted = seriesFromBuckets(
    buckets,
    counts,
    'submitted',
    'Submitted',
  );
  const accepted = seriesFromBuckets(buckets, counts, 'accepted', 'Accepted');
  const totals = {
    submitted: seriesTotal(submitted),
    accepted: seriesTotal(accepted),
  };
  const total = sumTotals(totals);

  return {
    series: [submitted, accepted],
    totals,
    summary: { value: total, label: 'Application lifecycle events' },
    empty: total === 0,
  };
}

function enrollmentStockData(
  plan: DashboardEnrollmentStockPlan,
  rows: readonly DashboardEnrollmentStockAggregate[],
): DashboardAdmissionsStudentsAnalyticsData {
  const counts = new Map(rows.map((row) => [row.key, row.count]));
  const points = plan.buckets.map((bucket) =>
    bucket.point(counts.get(bucket.key) ?? 0),
  );
  const lastValue = points.at(-1)?.y ?? 0;

  return {
    series: [
      { key: 'active_enrollments', label: 'Active enrollments', points },
    ],
    totals: { active_enrollments: lastValue },
    summary: { value: lastValue, label: 'Active enrollments' },
    empty: points.length === 0 || points.every((point) => point.y === 0),
  };
}

function withdrawalData(
  context: DashboardAnalyticsQueryContext,
  rows: readonly DashboardWithdrawalAggregate[],
): DashboardAdmissionsStudentsAnalyticsData {
  const buckets = queryBuckets(context);
  const counts = aggregateRowsByBucket(
    buckets,
    rows.map((row) => ({
      date: row.date,
      key: 'withdrawals',
      count: row.count,
    })),
  );
  const withdrawals = seriesFromBuckets(
    buckets,
    counts,
    'withdrawals',
    'Withdrawals',
  );
  const total = seriesTotal(withdrawals);

  return {
    series: [withdrawals],
    totals: { withdrawals: total },
    summary: { value: total, label: 'Withdrawals' },
    empty: total === 0,
  };
}

function guardianCoverageData(
  aggregate: DashboardGuardianCoverageAggregate,
): DashboardAdmissionsStudentsAnalyticsData {
  const total = aggregate.covered + aggregate.missing;
  return {
    series: [
      {
        key: 'covered',
        label: 'Covered',
        points: [
          dashboardAnalyticsCategoryPoint(
            'covered',
            'Covered',
            aggregate.covered,
          ),
        ],
      },
      {
        key: 'missing',
        label: 'Missing',
        points: [
          dashboardAnalyticsCategoryPoint(
            'missing',
            'Missing',
            aggregate.missing,
          ),
        ],
      },
    ],
    totals: { covered: aggregate.covered, missing: aggregate.missing },
    summary: { value: total, label: 'Active students' },
    empty: total === 0,
  };
}

type BucketCounts = Map<string, Map<string, number>>;

function queryBuckets(context: {
  granularity: DashboardAnalyticsGranularity;
  startCivilDate: string;
  endCivilDate: string;
}): DashboardAnalyticsBucket[] {
  return buildDashboardAnalyticsBuckets({
    granularity: context.granularity,
    startCivilDate: context.startCivilDate,
    endCivilDate: context.endCivilDate,
  });
}

function aggregateRowsByBucket(
  buckets: readonly DashboardAnalyticsBucket[],
  rows: readonly { date: string; key: string; count: number }[],
): BucketCounts {
  const counts: BucketCounts = new Map(
    buckets.map((bucket) => [bucket.key, new Map()]),
  );
  for (const row of rows) {
    const bucket = findDashboardAnalyticsBucket(buckets, row.date);
    if (!bucket) continue;
    const bucketCounts = counts.get(bucket.key)!;
    bucketCounts.set(row.key, (bucketCounts.get(row.key) ?? 0) + row.count);
  }
  return counts;
}

function seriesFromBuckets(
  buckets: readonly DashboardAnalyticsBucket[],
  counts: BucketCounts,
  key: string,
  label: string,
) {
  return {
    key,
    label,
    points: buckets.map((bucket) =>
      bucket.point(counts.get(bucket.key)?.get(key) ?? 0),
    ),
  };
}

function seriesTotal(series: {
  points: readonly DashboardAnalyticsChartDataPoint[];
}): number {
  return series.points.reduce((sum, point) => sum + point.y, 0);
}

function sumTotals(totals: Record<string, number>): number {
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}
