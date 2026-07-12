import { UserType } from '@prisma/client';
import { DashboardAnalyticsSnapshotRepository } from '../infrastructure/dashboard-analytics-snapshot.repository';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('DashboardAnalyticsSnapshotRepository', () => {
  it('applies resolved hierarchy and current civil date to attendance snapshots', async () => {
    const scoped = scopedPrismaMock();
    const repository = new DashboardAnalyticsSnapshotRepository({
      scoped,
    } as any);

    await repository.loadChartValue(
      scope(),
      'attendance.pending_sessions',
      queryContext(),
    );

    expect(scoped.attendanceSession.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'DRAFT',
        date: new Date('2026-07-12T00:00:00.000Z'),
        academicYearId: 'year-1',
        termId: 'term-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      }),
    });
  });

  it.each([
    ['grades.pending_submission_reviews', 'gradeSubmission'],
    ['grades.pending_answer_reviews', 'gradeSubmissionAnswer'],
  ] as const)(
    'applies verified GradeAssessment relation filters for %s',
    async (chartKey, delegateKey) => {
      const scoped = scopedPrismaMock();
      const repository = new DashboardAnalyticsSnapshotRepository({
        scoped,
      } as any);

      await repository.loadChartValue(scope(), chartKey, queryContext());

      expect(scoped[delegateKey].count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          assessment: {
            is: {
              academicYearId: 'year-1',
              termId: 'term-1',
              gradeId: 'grade-1',
              sectionId: 'section-1',
              classroomId: 'classroom-1',
            },
          },
        }),
      });

      const assessmentWhere =
        scoped[delegateKey].count.mock.calls[0][0].where.assessment.is;
      expect(assessmentWhere).not.toHaveProperty('deletedAt');
    },
  );

  it.each([
    ['grades.pending_submission_reviews', 'gradeSubmission', 'status'],
    [
      'grades.pending_answer_reviews',
      'gradeSubmissionAnswer',
      'correctionStatus',
    ],
  ] as const)(
    'preserves the default Grades snapshot predicate for %s',
    async (chartKey, delegateKey, statusKey) => {
      const scoped = scopedPrismaMock();
      const repository = new DashboardAnalyticsSnapshotRepository({
        scoped,
      } as any);
      const context = queryContext();
      context.hierarchy = {
        academicYearId: null,
        termId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      };

      await repository.loadChartValue(scope(), chartKey, context);

      const where = scoped[delegateKey].count.mock.calls[0][0].where;
      expect(where[statusKey]).toBeDefined();
      expect(where.assessment).toEqual({ is: {} });
      expect(where.assessment.is).not.toHaveProperty('deletedAt');
    },
  );
});

function scopedPrismaMock() {
  return {
    attendanceSession: { count: jest.fn().mockResolvedValue(1) },
    gradeSubmission: { count: jest.fn().mockResolvedValue(2) },
    gradeSubmissionAnswer: { count: jest.fn().mockResolvedValue(3) },
    communicationMessageReport: { count: jest.fn().mockResolvedValue(4) },
    schoolEmailConnection: {
      findFirst: jest.fn().mockResolvedValue({ id: 'connection-1' }),
    },
    schoolLoginSettings: {
      findFirst: jest.fn().mockResolvedValue({ id: 'settings-1' }),
    },
  };
}

function queryContext(): DashboardAnalyticsQueryContext {
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
      academicYearId: 'year-1',
      termId: 'term-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
    },
    explicitlySuppliedKeys: [],
    filtersApplied: [
      'academicYearId',
      'termId',
      'gradeId',
      'sectionId',
      'classroomId',
    ],
    filtersNotApplicable: ['range', 'granularity'],
  };
}

function scope() {
  return {
    actorId: 'actor-1',
    userType: UserType.SCHOOL_USER,
    organizationId: 'organization-1',
    schoolId: 'school-1',
    roleId: 'role-1',
  };
}
