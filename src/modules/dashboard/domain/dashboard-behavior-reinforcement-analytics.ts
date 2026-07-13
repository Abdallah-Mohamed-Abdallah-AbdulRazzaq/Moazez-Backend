import {
  DashboardBehaviorCategoryAggregate,
  DashboardBehaviorRecordTypeDailyAggregate,
} from '../infrastructure/dashboard-behavior-analytics.repository';
import {
  DashboardReinforcementAssignmentCompletionAggregate,
  DashboardRewardRedemptionFunnelAggregate,
  DashboardXpActivityDailyAggregate,
} from '../infrastructure/dashboard-reinforcement-analytics.repository';
import {
  buildDashboardAnalyticsBuckets,
  findDashboardAnalyticsBucket,
} from './dashboard-analytics-buckets';
import { DashboardAnalyticsBehaviorReinforcementPackChartKey } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCategoryPoint,
  dashboardAnalyticsSnapshotPoint,
  validateDashboardAnalyticsChartDataPoint,
} from './dashboard-analytics-coordinate';
import { DashboardAnalyticsQueryContext } from './dashboard-analytics-query';

export interface DashboardBehaviorReinforcementAnalyticsData {
  series: readonly {
    key: string;
    label: string;
    points: readonly DashboardAnalyticsChartDataPoint[];
  }[];
  totals: Record<string, number>;
  summary: { value: number; label: string };
  empty: boolean;
}

export function computeDashboardBehaviorReinforcementAnalyticsData(input: {
  chartKey: DashboardAnalyticsBehaviorReinforcementPackChartKey;
  queryContext: DashboardAnalyticsQueryContext;
  behaviorRecordTypes?: readonly DashboardBehaviorRecordTypeDailyAggregate[];
  pendingBehaviorReview?: number;
  behaviorCategories?: readonly DashboardBehaviorCategoryAggregate[];
  xpActivity?: readonly DashboardXpActivityDailyAggregate[];
  assignmentCompletion?: DashboardReinforcementAssignmentCompletionAggregate;
  rewardRedemptionFunnel?: DashboardRewardRedemptionFunnelAggregate;
}): DashboardBehaviorReinforcementAnalyticsData {
  switch (input.chartKey) {
    case 'behavior.positive_negative_trend':
      return behaviorRecordTypeTrend(
        input.queryContext,
        input.behaviorRecordTypes ?? [],
      );
    case 'behavior.pending_review':
      return pendingBehaviorReviewData(input.pendingBehaviorReview ?? 0);
    case 'behavior.records_by_category':
      return behaviorCategoryData(input.behaviorCategories ?? []);
    case 'reinforcement.xp_activity_trend':
      return xpActivityTrend(input.queryContext, input.xpActivity ?? []);
    case 'reinforcement.task_completion':
      return assignmentCompletionData(
        input.assignmentCompletion ?? {
          completed: 0,
          pending: 0,
          overdue: 0,
        },
      );
    case 'reinforcement.reward_redemption_status':
      return rewardRedemptionFunnelData(
        input.rewardRedemptionFunnel ?? {
          requested: 0,
          approved: 0,
          fulfilled: 0,
        },
      );
  }
}

function behaviorRecordTypeTrend(
  context: DashboardAnalyticsQueryContext,
  rows: readonly DashboardBehaviorRecordTypeDailyAggregate[],
): DashboardBehaviorReinforcementAnalyticsData {
  const buckets = analyticsBuckets(context);
  const counts = new Map(
    buckets.map((bucket) => [bucket.key, { positive: 0, negative: 0 }]),
  );

  for (const row of rows) {
    const bucket = findDashboardAnalyticsBucket(buckets, row.civilDate);
    if (!bucket) continue;
    const current = counts.get(bucket.key)!;
    current.positive += row.positive;
    current.negative += row.negative;
  }

  const positive = sumValues(counts, (value) => value.positive);
  const negative = sumValues(counts, (value) => value.negative);

  return {
    series: [
      bucketSeries('positive', 'Positive', buckets, counts, 'positive'),
      bucketSeries('negative', 'Negative', buckets, counts, 'negative'),
    ],
    totals: { positive, negative },
    summary: {
      value: positive + negative,
      label: 'Approved behavior records',
    },
    empty: positive + negative === 0,
  };
}

function pendingBehaviorReviewData(
  pendingReview: number,
): DashboardBehaviorReinforcementAnalyticsData {
  return {
    series: [
      {
        key: 'pending_review',
        label: 'Pending review',
        points: [dashboardAnalyticsSnapshotPoint(pendingReview)],
      },
    ],
    totals: { pending_review: pendingReview },
    summary: { value: pendingReview, label: 'Behavior records pending review' },
    empty: pendingReview === 0,
  };
}

function behaviorCategoryData(
  rows: readonly DashboardBehaviorCategoryAggregate[],
): DashboardBehaviorReinforcementAnalyticsData {
  const sorted = [...rows].sort(
    (left, right) =>
      right.count - left.count || left.label.localeCompare(right.label),
  );
  const total = sorted.reduce((sum, row) => sum + row.count, 0);

  return {
    series: [
      {
        key: 'records',
        label: 'Records',
        points: sorted.map((row) =>
          dashboardAnalyticsCategoryPoint(row.label, row.label, row.count),
        ),
      },
    ],
    totals: { records: total },
    summary: { value: total, label: 'Approved behavior records' },
    empty: total === 0,
  };
}

function xpActivityTrend(
  context: DashboardAnalyticsQueryContext,
  rows: readonly DashboardXpActivityDailyAggregate[],
): DashboardBehaviorReinforcementAnalyticsData {
  const buckets = analyticsBuckets(context);
  const counts = new Map(buckets.map((bucket) => [bucket.key, { xp: 0 }]));

  for (const row of rows) {
    const bucket = findDashboardAnalyticsBucket(buckets, row.civilDate);
    if (!bucket) continue;
    counts.get(bucket.key)!.xp += row.xp;
  }

  const xp = sumValues(counts, (value) => value.xp);
  return {
    series: [bucketSeries('xp', 'XP', buckets, counts, 'xp')],
    totals: { xp },
    summary: { value: xp, label: 'Net XP activity' },
    empty: rows.length === 0,
  };
}

function assignmentCompletionData(
  aggregate: DashboardReinforcementAssignmentCompletionAggregate,
): DashboardBehaviorReinforcementAnalyticsData {
  return fixedCategoryData(
    [
      category('completed', 'Completed', aggregate.completed),
      category('pending', 'Pending', aggregate.pending),
      category('overdue', 'Overdue', aggregate.overdue),
    ],
    'Current reinforcement assignments',
  );
}

function rewardRedemptionFunnelData(
  aggregate: DashboardRewardRedemptionFunnelAggregate,
): DashboardBehaviorReinforcementAnalyticsData {
  const stages = [
    { key: 'requested', label: 'Requested', value: aggregate.requested },
    { key: 'approved', label: 'Approved', value: aggregate.approved },
    { key: 'fulfilled', label: 'Fulfilled', value: aggregate.fulfilled },
  ] as const;

  return {
    series: stages.map((stage, order) => ({
      key: stage.key,
      label: stage.label,
      points: [funnelStagePoint(stage.key, order, stage.value)],
    })),
    totals: Object.fromEntries(stages.map((stage) => [stage.key, stage.value])),
    summary: {
      value: aggregate.requested,
      label: 'Reward redemption requests',
    },
    empty: aggregate.requested === 0,
  };
}

function analyticsBuckets(context: DashboardAnalyticsQueryContext) {
  return buildDashboardAnalyticsBuckets({
    granularity: context.granularity,
    startCivilDate: context.startCivilDate,
    endCivilDate: context.endCivilDate,
  });
}

function bucketSeries<T extends Record<K, number>, K extends string>(
  key: string,
  label: string,
  buckets: ReturnType<typeof analyticsBuckets>,
  counts: ReadonlyMap<string, T>,
  valueKey: K,
) {
  return {
    key,
    label,
    points: buckets.map((bucket) =>
      bucket.point(counts.get(bucket.key)![valueKey]),
    ),
  };
}

function sumValues<T>(
  values: ReadonlyMap<string, T>,
  select: (value: T) => number,
): number {
  return [...values.values()].reduce((sum, value) => sum + select(value), 0);
}

function category(key: string, label: string, value: number) {
  return { key, label, value };
}

function fixedCategoryData(
  categories: readonly { key: string; label: string; value: number }[],
  summaryLabel: string,
): DashboardBehaviorReinforcementAnalyticsData {
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  return {
    series: categories.map((item) => ({
      key: item.key,
      label: item.label,
      points: [
        dashboardAnalyticsCategoryPoint(item.key, item.label, item.value),
      ],
    })),
    totals: Object.fromEntries(
      categories.map((item) => [item.key, item.value]),
    ),
    summary: { value: total, label: summaryLabel },
    empty: total === 0,
  };
}

function funnelStagePoint(
  stageKey: string,
  order: number,
  y: number,
): DashboardAnalyticsChartDataPoint {
  return validateDashboardAnalyticsChartDataPoint({
    x: stageKey,
    y,
    coordinate: { kind: 'funnel_stage', stageKey, order },
  });
}
