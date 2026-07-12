import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { DashboardAnalyticsQueryContextService } from '../application/dashboard-analytics-query-context.service';
import { findDashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import { DashboardAnalyticsHierarchyRepository } from '../infrastructure/dashboard-analytics-hierarchy.repository';
import { dashboardTimeContextServiceMock } from './dashboard-test-time-context';

const ACADEMIC_YEAR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACADEMIC_YEAR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TERM_ID = '22222222-2222-4222-8222-222222222222';
const GRADE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_GRADE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECTION_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_SECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLASSROOM_ID = '55555555-5555-4555-8555-555555555555';

describe('DashboardAnalyticsQueryContextService', () => {
  it('preserves snapshot defaults as not applicable while applying active academic context', async () => {
    const repository = hierarchyRepositoryMock();
    const service = queryService(repository);

    const context = await service.resolve(
      scope(),
      chart('attendance.pending_sessions'),
      {},
    );

    expect(context).toMatchObject({
      timezone: 'Africa/Cairo',
      range: '30d',
      granularity: 'day',
      startCivilDate: '2026-06-13',
      endCivilDate: '2026-07-12',
      hierarchy: {
        academicYearId: ACADEMIC_YEAR_ID,
        termId: TERM_ID,
      },
      explicitlySuppliedKeys: [],
      filtersApplied: ['academicYearId', 'termId'],
      filtersNotApplicable: ['range', 'granularity'],
    });
  });

  it('accepts explicitly supplied legacy snapshot defaults without pretending they apply', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('attendance.pending_sessions'),
      { range: '30d', granularity: 'day' },
    );

    expect(context.explicitlySuppliedKeys).toEqual(['range', 'granularity']);
    expect(context.filtersNotApplicable).toEqual(['range', 'granularity']);
  });

  it('resolves and derives same-school grade, section, and classroom hierarchy', async () => {
    const repository = hierarchyRepositoryMock();
    const service = queryService(repository);

    const context = await service.resolve(
      scope(),
      chart('attendance.pending_sessions'),
      { sectionId: SECTION_ID, classroomId: CLASSROOM_ID },
    );

    expect(context.hierarchy).toMatchObject({
      gradeId: GRADE_ID,
      sectionId: SECTION_ID,
      classroomId: CLASSROOM_ID,
    });
    expect(context.explicitlySuppliedKeys).toEqual([
      'sectionId',
      'classroomId',
    ]);
    expect(context.filtersApplied).toEqual(
      expect.arrayContaining(['gradeId', 'sectionId', 'classroomId']),
    );
  });

  it('returns safe not-found for a cross-school hierarchy identifier', async () => {
    const repository = hierarchyRepositoryMock();
    repository.findGradeById.mockResolvedValue(null);
    const service = queryService(repository);

    await expect(
      service.resolve(scope(), chart('attendance.pending_sessions'), {
        gradeId: GRADE_ID,
      }),
    ).rejects.toMatchObject({
      constructor: NotFoundDomainException,
      message: 'Dashboard analytics hierarchy was not found',
      details: undefined,
    });
  });

  it('rejects malformed UUIDs before hierarchy repository access', async () => {
    const repository = hierarchyRepositoryMock();
    const service = queryService(repository);

    await expect(
      service.resolve(scope(), chart('attendance.pending_sessions'), {
        gradeId: 'not-a-uuid',
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.findGradeById).not.toHaveBeenCalled();
  });

  it('returns safe not-found for inconsistent term and academic-year chains', async () => {
    const repository = hierarchyRepositoryMock();
    repository.findTermById.mockResolvedValue({
      id: TERM_ID,
      academicYearId: OTHER_ACADEMIC_YEAR_ID,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z'),
    });

    await expect(
      queryService(repository).resolve(
        scope(),
        chart('attendance.daily_trend'),
        { academicYearId: ACADEMIC_YEAR_ID, termId: TERM_ID },
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('returns safe not-found for inconsistent section-to-grade chains', async () => {
    const repository = hierarchyRepositoryMock();
    repository.findSectionById.mockResolvedValue({
      id: SECTION_ID,
      gradeId: OTHER_GRADE_ID,
    });

    await expect(
      queryService(repository).resolve(
        scope(),
        chart('attendance.pending_sessions'),
        { gradeId: GRADE_ID, sectionId: SECTION_ID },
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it.each([
    ['section', { sectionId: OTHER_SECTION_ID }],
    ['grade', { gradeId: OTHER_GRADE_ID }],
  ])(
    'returns safe not-found for inconsistent classroom-to-%s chains',
    async (_label, query) => {
      const repository = hierarchyRepositoryMock();
      if (query.sectionId) {
        repository.findSectionById.mockResolvedValue({
          id: query.sectionId,
          gradeId: GRADE_ID,
        });
      }
      if (query.gradeId) {
        repository.findGradeById.mockResolvedValue({ id: query.gradeId });
      }

      await expect(
        queryService(repository).resolve(
          scope(),
          chart('attendance.pending_sessions'),
          { ...query, classroomId: CLASSROOM_ID },
        ),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
    },
  );

  it('resolves requested term dates and caps their window at generatedAt', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('attendance.daily_trend'),
      { range: 'term', granularity: 'week', termId: TERM_ID },
    );

    expect(context).toMatchObject({
      range: 'term',
      granularity: 'week',
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-12',
      hierarchy: {
        academicYearId: ACADEMIC_YEAR_ID,
        termId: TERM_ID,
      },
      filtersApplied: ['range', 'granularity', 'academicYearId', 'termId'],
    });
    expect(context.endExclusive.toISOString()).toBe('2026-07-11T22:30:00.000Z');
  });

  it('resolves the active academic-year range when no id is supplied', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('attendance.daily_trend'),
      { range: 'academic_year', granularity: 'month' },
    );

    expect(context.hierarchy.academicYearId).toBe(ACADEMIC_YEAR_ID);
    expect(context.startCivilDate).toBe('2026-01-01');
    expect(context.endCivilDate).toBe('2026-07-12');
  });

  it('rejects unsupported hierarchy and non-default snapshot time filters', async () => {
    const service = queryService(hierarchyRepositoryMock());

    await expect(
      service.resolve(scope(), chart('communication.moderation_queue'), {
        gradeId: GRADE_ID,
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    await expect(
      service.resolve(scope(), chart('attendance.pending_sessions'), {
        range: '90d',
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });
});

function queryService(
  repository: ReturnType<typeof hierarchyRepositoryMock>,
): DashboardAnalyticsQueryContextService {
  return new DashboardAnalyticsQueryContextService(
    dashboardTimeContextServiceMock() as any,
    repository as unknown as DashboardAnalyticsHierarchyRepository,
  );
}

function hierarchyRepositoryMock() {
  return {
    findAcademicYearById: jest.fn().mockResolvedValue({
      id: ACADEMIC_YEAR_ID,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    }),
    findActiveAcademicYear: jest.fn().mockResolvedValue({
      id: ACADEMIC_YEAR_ID,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    }),
    findTermById: jest.fn().mockResolvedValue({
      id: TERM_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z'),
    }),
    findActiveTerm: jest.fn().mockResolvedValue({
      id: TERM_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z'),
    }),
    findGradeById: jest.fn().mockResolvedValue({ id: GRADE_ID }),
    findSectionById: jest.fn().mockResolvedValue({
      id: SECTION_ID,
      gradeId: GRADE_ID,
    }),
    findClassroomById: jest.fn().mockResolvedValue({
      id: CLASSROOM_ID,
      sectionId: SECTION_ID,
      gradeId: GRADE_ID,
    }),
  };
}

function chart(chartKey: string) {
  const definition = findDashboardAnalyticsChartDefinition(chartKey);
  if (!definition) throw new Error(`Missing chart ${chartKey}`);
  return definition;
}

function scope() {
  return {
    actorId: 'actor-1',
    organizationId: 'organization-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    userType: 'SCHOOL_USER' as const,
  };
}
