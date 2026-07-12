import { AdmissionApplicationStatus } from '@prisma/client';
import {
  buildDashboardEnrollmentStockPlan,
  computeDashboardAdmissionsStudentsAnalyticsData,
} from '../domain/dashboard-admissions-students-analytics';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('Dashboard Admissions and Students analytics computation', () => {
  it('returns all six Application categories in catalog order with zero filling', () => {
    const data = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'admissions.applications_by_status',
      queryContext: context(),
      applicationStatusAggregates: [
        { status: AdmissionApplicationStatus.SUBMITTED, count: 3 },
        { status: AdmissionApplicationStatus.ACCEPTED, count: 2 },
      ],
    });

    expect(data.series.map((series) => series.key)).toEqual([
      'documents_pending',
      'submitted',
      'under_review',
      'accepted',
      'rejected',
      'waitlisted',
    ]);
    expect(data.totals).toEqual({
      documents_pending: 0,
      submitted: 3,
      under_review: 0,
      accepted: 2,
      rejected: 0,
      waitlisted: 0,
    });
    expect(data.series[0].points[0]).toMatchObject({
      x: 'documents_pending',
      y: 0,
      coordinate: {
        kind: 'category',
        key: 'documents_pending',
        label: 'Documents pending',
      },
    });
    expect(data.summary).toEqual({ value: 5, label: 'Applications' });
    expect(data.empty).toBe(false);
  });

  it('zero-fills identical Application event coordinates and totals events rather than entities', () => {
    const data = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'admissions.applications_over_time',
      queryContext: context({
        startCivilDate: '2026-07-01',
        endCivilDate: '2026-07-03',
      }),
      applicationEventAggregates: [
        { date: '2026-07-01', event: 'submitted', count: 2 },
        { date: '2026-07-03', event: 'accepted', count: 1 },
      ],
    });

    expect(data.series[0].points.map((point) => [point.x, point.y])).toEqual([
      ['2026-07-01', 2],
      ['2026-07-02', 0],
      ['2026-07-03', 0],
    ]);
    expect(data.series[1].points.map((point) => [point.x, point.y])).toEqual([
      ['2026-07-01', 0],
      ['2026-07-02', 0],
      ['2026-07-03', 1],
    ]);
    expect(data.totals).toEqual({ submitted: 2, accepted: 1 });
    expect(data.summary).toEqual({
      value: 3,
      label: 'Application lifecycle events',
    });
  });

  it('rolls Application events into clipped Monday weeks and calendar months', () => {
    const weekly = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'admissions.applications_over_time',
      queryContext: context({
        granularity: 'week',
        startCivilDate: '2026-06-28',
        endCivilDate: '2026-07-12',
      }),
      applicationEventAggregates: [
        { date: '2026-06-28', event: 'submitted', count: 1 },
        { date: '2026-06-29', event: 'submitted', count: 2 },
      ],
    });
    expect(weekly.series[0].points.map((point) => [point.x, point.y])).toEqual([
      ['2026-06-28/2026-06-28', 1],
      ['2026-06-29/2026-07-05', 2],
      ['2026-07-06/2026-07-12', 0],
    ]);

    const monthly = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'admissions.applications_over_time',
      queryContext: context({
        granularity: 'month',
        startCivilDate: '2026-06-28',
        endCivilDate: '2026-07-31',
      }),
      applicationEventAggregates: [
        { date: '2026-06-30', event: 'accepted', count: 1 },
        { date: '2026-07-01', event: 'accepted', count: 2 },
      ],
    });
    expect(monthly.series[1].points.map((point) => [point.x, point.y])).toEqual(
      [
        ['2026-06', 1],
        ['2026-07', 2],
      ],
    );
  });

  it('builds completed and current-partial stock evaluations without future points in Africa/Cairo', () => {
    const plan = buildDashboardEnrollmentStockPlan(
      context({
        generatedAt: new Date('2026-07-12T00:30:00.000Z'),
        timezone: 'Africa/Cairo',
        startCivilDate: '2026-07-10',
        endCivilDate: '2026-07-15',
      }),
    );

    expect(plan.buckets.map((bucket) => bucket.key)).toEqual([
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
    expect(plan.evaluations.map((evaluation) => evaluation.kind)).toEqual([
      'completed_bucket',
      'completed_bucket',
      'current_partial',
    ]);
    expect(plan.evaluations[2].instant.toISOString()).toBe(
      '2026-07-12T00:30:00.000Z',
    );
  });

  it('uses the last stock point for totals and summary rather than summing stock', () => {
    const queryContext = context({
      generatedAt: new Date('2026-07-03T12:00:00.000Z'),
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-03',
    });
    const plan = buildDashboardEnrollmentStockPlan(queryContext);
    const data = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'students.enrollment_growth',
      queryContext,
      enrollmentStockPlan: plan,
      enrollmentStockAggregates: [
        { key: '2026-07-01', count: 3 },
        { key: '2026-07-02', count: 5 },
        { key: '2026-07-03', count: 4 },
      ],
    });

    expect(data.totals).toEqual({ active_enrollments: 4 });
    expect(data.summary).toEqual({ value: 4, label: 'Active enrollments' });
    expect(data.empty).toBe(false);
  });

  it('zero-fills withdrawal buckets and sums only withdrawal events', () => {
    const data = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'students.withdrawal_trend',
      queryContext: context({
        startCivilDate: '2026-07-01',
        endCivilDate: '2026-07-03',
      }),
      withdrawalAggregates: [{ date: '2026-07-02', count: 2 }],
    });

    expect(data.series[0].points.map((point) => point.y)).toEqual([0, 2, 0]);
    expect(data.totals).toEqual({ withdrawals: 2 });
    expect(data.summary).toEqual({ value: 2, label: 'Withdrawals' });
  });

  it('returns distinct-Student guardian categories and an empty population state', () => {
    const populated = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'students.guardian_coverage',
      queryContext: context(),
      guardianCoverage: { covered: 6, missing: 2 },
    });
    expect(populated.series.map((series) => series.key)).toEqual([
      'covered',
      'missing',
    ]);
    expect(populated.summary).toEqual({ value: 8, label: 'Active students' });
    expect(populated.empty).toBe(false);

    const empty = computeDashboardAdmissionsStudentsAnalyticsData({
      chartKey: 'students.guardian_coverage',
      queryContext: context(),
      guardianCoverage: { covered: 0, missing: 0 },
    });
    expect(empty.empty).toBe(true);
  });
});

function context(
  overrides: Partial<DashboardAnalyticsQueryContext> = {},
): DashboardAnalyticsQueryContext {
  return {
    generatedAt: new Date('2026-07-12T12:00:00.000Z'),
    timezone: 'UTC',
    range: '30d',
    granularity: 'day',
    startInclusive: new Date('2026-06-13T00:00:00.000Z'),
    endExclusive: new Date('2026-07-13T00:00:00.000Z'),
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
    filtersApplied: ['range', 'granularity'],
    filtersNotApplicable: [],
    ...overrides,
  };
}
