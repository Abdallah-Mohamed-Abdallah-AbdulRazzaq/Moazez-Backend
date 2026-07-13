import { computeDashboardBehaviorReinforcementAnalyticsData } from '../domain/dashboard-behavior-reinforcement-analytics';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('Dashboard Behavior/Reinforcement analytics computations', () => {
  it('zero-fills approved positive and negative records in deterministic week buckets', () => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey: 'behavior.positive_negative_trend',
      queryContext: context({
        granularity: 'week',
        startCivilDate: '2026-07-01',
        endCivilDate: '2026-07-14',
      }),
      behaviorRecordTypes: [
        { civilDate: '2026-07-02', positive: 2, negative: 1 },
        { civilDate: '2026-07-08', positive: 0, negative: 3 },
      ],
    });

    expect(data.series.map((series) => series.key)).toEqual([
      'positive',
      'negative',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([2, 0, 0]);
    expect(data.series[1]?.points.map((point) => point.y)).toEqual([1, 3, 0]);
    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      '2026-07-01/2026-07-05',
      '2026-07-06/2026-07-12',
      '2026-07-13/2026-07-14',
    ]);
    expect(data.totals).toEqual({ positive: 2, negative: 4 });
    expect(data.summary).toEqual({
      value: 6,
      label: 'Approved behavior records',
    });
  });

  it('builds a snapshot-compatible pending-review response', () => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey: 'behavior.pending_review',
      queryContext: context(),
      pendingBehaviorReview: 4,
    });

    expect(data.series).toEqual([
      {
        key: 'pending_review',
        label: 'Pending review',
        points: [{ x: 'snapshot', y: 4, coordinate: { kind: 'snapshot' } }],
      },
    ]);
    expect(data.totals).toEqual({ pending_review: 4 });
    expect(data.empty).toBe(false);
  });

  it('sorts safe category labels by count then label and returns no identifiers', () => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey: 'behavior.records_by_category',
      queryContext: context(),
      behaviorCategories: [
        { label: 'Uncategorized', count: 1 },
        { label: 'Respect', count: 3 },
        { label: 'Attendance', count: 3 },
      ],
    });

    expect(data.series).toHaveLength(1);
    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      'Attendance',
      'Respect',
      'Uncategorized',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([3, 3, 1]);
    expect(data.totals).toEqual({ records: 7 });
    expect(JSON.stringify(data)).not.toMatch(/categoryId|studentId|recordId/);
  });

  it('preserves net negative XP without clamping and zero-fills month buckets', () => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey: 'reinforcement.xp_activity_trend',
      queryContext: context({
        granularity: 'month',
        startCivilDate: '2026-06-29',
        endCivilDate: '2026-07-03',
      }),
      xpActivity: [
        { civilDate: '2026-06-30', xp: 5 },
        { civilDate: '2026-07-01', xp: -9 },
      ],
    });

    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      '2026-06',
      '2026-07',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([5, -9]);
    expect(data.totals).toEqual({ xp: -4 });
    expect(data.summary).toEqual({ value: -4, label: 'Net XP activity' });
    expect(data.empty).toBe(false);
  });

  it('returns assignment-level completion in stable precedence order', () => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey: 'reinforcement.task_completion',
      queryContext: context(),
      assignmentCompletion: { completed: 2, pending: 3, overdue: 4 },
    });

    expect(data.series.map((series) => series.key)).toEqual([
      'completed',
      'pending',
      'overdue',
    ]);
    expect(data.series.map((series) => series.points[0]?.y)).toEqual([2, 3, 4]);
    expect(data.summary).toEqual({
      value: 9,
      label: 'Current reinforcement assignments',
    });
  });

  it('returns a monotonic cumulative reward-request funnel', () => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey: 'reinforcement.reward_redemption_status',
      queryContext: context(),
      rewardRedemptionFunnel: { requested: 8, approved: 5, fulfilled: 2 },
    });

    expect(data.series.map((series) => series.key)).toEqual([
      'requested',
      'approved',
      'fulfilled',
    ]);
    expect(data.series.map((series) => series.points[0]?.y)).toEqual([8, 5, 2]);
    expect(
      data.series.map((series) => series.points[0]?.coordinate.kind),
    ).toEqual(['funnel_stage', 'funnel_stage', 'funnel_stage']);
    expect(data.summary).toEqual({
      value: 8,
      label: 'Reward redemption requests',
    });
  });

  it.each([
    'behavior.positive_negative_trend',
    'behavior.pending_review',
    'behavior.records_by_category',
    'reinforcement.xp_activity_trend',
    'reinforcement.task_completion',
    'reinforcement.reward_redemption_status',
  ] as const)('returns a truthful empty result for %s', (chartKey) => {
    const data = computeDashboardBehaviorReinforcementAnalyticsData({
      chartKey,
      queryContext: context({
        startCivilDate: '2026-07-12',
        endCivilDate: '2026-07-12',
      }),
    });
    expect(data.empty).toBe(true);
  });
});

function context(
  overrides: Partial<DashboardAnalyticsQueryContext> = {},
): DashboardAnalyticsQueryContext {
  return {
    generatedAt: new Date('2026-07-12T12:00:00.000Z'),
    timezone: 'Africa/Cairo',
    range: '30d',
    granularity: 'day',
    startInclusive: new Date('2026-06-12T21:00:00.000Z'),
    endExclusive: new Date('2026-07-12T21:00:00.000Z'),
    startCivilDate: '2026-06-13',
    endCivilDate: '2026-07-12',
    hierarchy: {
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
    explicitlySuppliedKeys: [],
    filtersApplied: [],
    filtersNotApplicable: ['range', 'granularity'],
    ...overrides,
  };
}
