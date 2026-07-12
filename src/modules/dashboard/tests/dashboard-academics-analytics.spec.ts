import { computeDashboardAcademicsAnalyticsData } from '../domain/dashboard-academics-analytics';

describe('Dashboard Academics analytics computations', () => {
  it.each([
    [
      'academics.teacher_allocation_coverage',
      { teacherAllocationCoverage: { allocated: 3, missing: 2 } },
      ['allocated', 'missing'],
      { allocated: 3, missing: 2 },
      'Teacher allocation units',
    ],
    [
      'academics.timetable_publication_status',
      { timetablePublicationStatus: { published: 4, draft: 1 } },
      ['published', 'draft'],
      { published: 4, draft: 1 },
      'Current timetable configurations',
    ],
    [
      'academics.curriculum_activation',
      { curriculumActivation: { active: 2, draft: 3 } },
      ['active', 'draft'],
      { active: 2, draft: 3 },
      'Current curricula',
    ],
    [
      'academics.lesson_plan_activation',
      { lessonPlanActivation: { active: 1, draft: 4 } },
      ['active', 'draft'],
      { active: 1, draft: 4 },
      'Current lesson plans',
    ],
  ] as const)(
    'computes %s as deterministic category data',
    (chartKey, aggregate, seriesKeys, totals, summaryLabel) => {
      const data = computeDashboardAcademicsAnalyticsData({
        chartKey,
        ...aggregate,
      });

      expect(data.series.map((series) => series.key)).toEqual(seriesKeys);
      expect(data.series.map((series) => series.points[0]?.y)).toEqual(
        Object.values(totals),
      );
      expect(
        data.series.map((series) => series.points[0]?.coordinate.kind),
      ).toEqual(seriesKeys.map(() => 'category'));
      expect(data.totals).toEqual(totals);
      expect(data.summary).toEqual({ value: 5, label: summaryLabel });
      expect(data.empty).toBe(false);
    },
  );

  it('zero-fills every category and reports an empty denominator', () => {
    const data = computeDashboardAcademicsAnalyticsData({
      chartKey: 'academics.teacher_allocation_coverage',
      teacherAllocationCoverage: { allocated: 0, missing: 0 },
    });

    expect(data.series).toEqual([
      expect.objectContaining({
        key: 'allocated',
        points: [expect.objectContaining({ x: 'allocated', y: 0 })],
      }),
      expect.objectContaining({
        key: 'missing',
        points: [expect.objectContaining({ x: 'missing', y: 0 })],
      }),
    ]);
    expect(data.summary?.value).toBe(0);
    expect(data.empty).toBe(true);
  });
});
