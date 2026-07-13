import { computeDashboardGradesHomeworkAnalyticsData } from '../domain/dashboard-grades-homework-analytics';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('Dashboard Grades/Homework analytics computations', () => {
  it.each([
    [
      'grades.assessment_status_distribution',
      { assessmentStatus: { draft: 1, published: 2, approved: 3, locked: 4 } },
      ['draft', 'published', 'approved', 'locked'],
      'Current assessments',
      10,
    ],
    [
      'grades.gradebook_completion',
      { gradebookCompletion: { complete: 3, missing: 2 } },
      ['complete', 'missing'],
      'Expected gradebook cells',
      5,
    ],
    [
      'homework.assignment_status_distribution',
      { assignmentStatus: { draft: 1, published: 2, closed: 3, cancelled: 4 } },
      ['draft', 'published', 'closed', 'cancelled'],
      'Current homework assignments',
      10,
    ],
    [
      'homework.grade_sync_coverage',
      { gradeSyncCoverage: { linked: 3, pending: 2 } },
      ['linked', 'pending'],
      'Graded homework assignments',
      5,
    ],
  ] as const)(
    'computes %s in exact category order',
    (chartKey, aggregate, keys, label, total) => {
      const data = computeDashboardGradesHomeworkAnalyticsData({
        chartKey,
        queryContext: context(),
        ...aggregate,
      });
      expect(data.series.map((series) => series.key)).toEqual(keys);
      expect(
        data.series.map((series) => series.points[0]?.coordinate.kind),
      ).toEqual(keys.map(() => 'category'));
      expect(data.summary).toEqual({ value: total, label });
      expect(data.empty).toBe(false);
    },
  );

  it('zero-fills deterministic week buckets and aggregates independent events', () => {
    const data = computeDashboardGradesHomeworkAnalyticsData({
      chartKey: 'homework.submission_review_trend',
      queryContext: context({
        granularity: 'week',
        startCivilDate: '2026-07-01',
        endCivilDate: '2026-07-14',
      }),
      submissionReviewEvents: [
        { civilDate: '2026-07-02', submitted: 2, reviewed: 0 },
        { civilDate: '2026-07-08', submitted: 0, reviewed: 1 },
      ],
    });

    expect(data.series.map((series) => series.key)).toEqual([
      'submitted',
      'reviewed',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([2, 0, 0]);
    expect(data.series[1]?.points.map((point) => point.y)).toEqual([0, 1, 0]);
    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      '2026-07-01/2026-07-05',
      '2026-07-06/2026-07-12',
      '2026-07-13/2026-07-14',
    ]);
    expect(data.totals).toEqual({ submitted: 2, reviewed: 1 });
    expect(data.summary).toEqual({
      value: 3,
      label: 'Submission review events',
    });
  });

  it('returns a truthful zero-filled no-data series', () => {
    const data = computeDashboardGradesHomeworkAnalyticsData({
      chartKey: 'homework.submission_review_trend',
      queryContext: context({
        startCivilDate: '2026-07-12',
        endCivilDate: '2026-07-12',
      }),
      submissionReviewEvents: [],
    });
    expect(data.series.map((series) => series.points[0]?.y)).toEqual([0, 0]);
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
