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

  it('applies excuse ranges while reporting the compatible day granularity as not applicable', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('attendance.excuse_status'),
      {
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-03',
        academicYearId: ACADEMIC_YEAR_ID,
        termId: TERM_ID,
      },
    );

    expect(context.filtersApplied).toEqual([
      'range',
      'dateFrom',
      'dateTo',
      'academicYearId',
      'termId',
    ]);
    expect(context.filtersNotApplicable).toEqual(['granularity']);
    expect(context.startCivilDate).toBe('2026-07-01');
    expect(context.endCivilDate).toBe('2026-07-03');
  });

  it.each(['week', 'month'] as const)(
    'rejects %s granularity for the excuse category chart',
    async (granularity) => {
      const repository = hierarchyRepositoryMock();
      await expect(
        queryService(repository).resolve(
          scope(),
          chart('attendance.excuse_status'),
          { granularity },
        ),
      ).rejects.toBeInstanceOf(ValidationDomainException);
      expect(repository.findActiveAcademicYear).not.toHaveBeenCalled();
    },
  );

  it.each(['gradeId', 'sectionId', 'classroomId'] as const)(
    'rejects %s before hierarchy resolution for the excuse chart',
    async (filter) => {
      const repository = hierarchyRepositoryMock();
      await expect(
        queryService(repository).resolve(
          scope(),
          chart('attendance.excuse_status'),
          { [filter]: GRADE_ID },
        ),
      ).rejects.toBeInstanceOf(ValidationDomainException);
      expect(repository.findGradeById).not.toHaveBeenCalled();
      expect(repository.findSectionById).not.toHaveBeenCalled();
      expect(repository.findClassroomById).not.toHaveBeenCalled();
    },
  );

  it('applies snapshot compatibility to behavior.pending_review', async () => {
    const accepted = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('behavior.pending_review'),
      { range: '30d', granularity: 'day' },
    );
    expect(accepted.filtersApplied).toEqual(['academicYearId', 'termId']);
    expect(accepted.filtersNotApplicable).toEqual(['range', 'granularity']);

    for (const query of [
      { range: '7d' as const },
      { granularity: 'week' as const },
    ]) {
      const repository = hierarchyRepositoryMock();
      await expect(
        queryService(repository).resolve(
          scope(),
          chart('behavior.pending_review'),
          query,
        ),
      ).rejects.toMatchObject({
        constructor: ValidationDomainException,
        message: 'Snapshot chart does not support the requested time filter',
      });
      expect(repository.findActiveAcademicYear).not.toHaveBeenCalled();
    }
  });

  it.each([
    'behavior.positive_negative_trend',
    'reinforcement.xp_activity_trend',
  ])('applies historical range and granularity for %s', async (chartKey) => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart(chartKey),
      { range: '30d', granularity: 'week' },
    );
    expect(context.filtersApplied).toEqual(['range', 'granularity']);
    expect(context.filtersNotApplicable).toEqual([]);
  });

  it.each([
    'behavior.records_by_category',
    'reinforcement.reward_redemption_status',
  ])('applies range but not granularity for %s', async (chartKey) => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart(chartKey),
      { range: '7d', granularity: 'day', gradeId: GRADE_ID },
    );
    expect(context.filtersApplied).toEqual(['range', 'gradeId']);
    expect(context.filtersNotApplicable).toEqual(['granularity']);

    await expect(
      queryService(hierarchyRepositoryMock()).resolve(
        scope(),
        chart(chartKey),
        { granularity: 'week' },
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });

  it('preserves hierarchy metadata for reinforcement task compatibility defaults', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('reinforcement.task_completion'),
      { range: '30d', granularity: 'day', gradeId: GRADE_ID },
    );
    expect(context.filtersApplied).toEqual(['gradeId']);
    expect(context.filtersNotApplicable).toEqual(['range', 'granularity']);
  });

  it('applies historical range and granularity to the homework submission review trend', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('homework.submission_review_trend'),
      { range: '30d', granularity: 'week' },
    );
    expect(context.filtersApplied).toEqual(['range', 'granularity']);
    expect(context.filtersNotApplicable).toEqual([]);
  });

  it.each(['admissions.applications_by_status', 'students.guardian_coverage'])(
    'accepts only compatibility defaults and preserves hierarchy metadata for %s',
    async (chartKey) => {
      const context = await queryService(hierarchyRepositoryMock()).resolve(
        scope(),
        chart(chartKey),
        {
          range: '30d',
          granularity: 'day',
          academicYearId: ACADEMIC_YEAR_ID,
          gradeId: GRADE_ID,
        },
      );

      expect(context.explicitlySuppliedKeys).toEqual([
        'range',
        'granularity',
        'academicYearId',
        'gradeId',
      ]);
      expect(context.filtersApplied).toEqual(['academicYearId', 'gradeId']);
      expect(context.filtersNotApplicable).toEqual(['range', 'granularity']);
    },
  );

  it.each([
    [
      'academics.teacher_allocation_coverage',
      { academicYearId: ACADEMIC_YEAR_ID, termId: TERM_ID, gradeId: GRADE_ID },
      ['academicYearId', 'termId', 'gradeId'],
    ],
    [
      'academics.timetable_publication_status',
      { academicYearId: ACADEMIC_YEAR_ID, termId: TERM_ID },
      ['academicYearId', 'termId'],
    ],
    [
      'academics.curriculum_activation',
      { academicYearId: ACADEMIC_YEAR_ID, termId: TERM_ID, gradeId: GRADE_ID },
      ['academicYearId', 'termId', 'gradeId'],
    ],
    [
      'academics.lesson_plan_activation',
      { academicYearId: ACADEMIC_YEAR_ID, termId: TERM_ID, gradeId: GRADE_ID },
      ['academicYearId', 'termId', 'gradeId'],
    ],
  ] as const)(
    'keeps compatibility time defaults not applicable while applying %s hierarchy',
    async (chartKey, hierarchyQuery, hierarchyKeys) => {
      const context = await queryService(hierarchyRepositoryMock()).resolve(
        scope(),
        chart(chartKey),
        { range: '30d', granularity: 'day', ...hierarchyQuery },
      );

      expect(context.filtersApplied).toEqual(hierarchyKeys);
      expect(context.filtersNotApplicable).toEqual(['range', 'granularity']);
      expect(context.explicitlySuppliedKeys).toEqual([
        'range',
        'granularity',
        ...hierarchyKeys,
      ]);
    },
  );

  it.each([
    'academics.teacher_allocation_coverage',
    'academics.timetable_publication_status',
    'academics.curriculum_activation',
    'academics.lesson_plan_activation',
  ])(
    'rejects every nondefault current-category time input for %s',
    async (chartKey) => {
      for (const rawQuery of [
        { range: '7d' as const },
        {
          range: 'custom' as const,
          dateFrom: '2026-07-01',
          dateTo: '2026-07-02',
        },
        { granularity: 'week' as const },
        { granularity: 'month' as const },
        { dateFrom: '2026-07-01' },
        { dateTo: '2026-07-02' },
      ]) {
        await expect(
          queryService(hierarchyRepositoryMock()).resolve(
            scope(),
            chart(chartKey),
            rawQuery,
          ),
        ).rejects.toBeInstanceOf(ValidationDomainException);
      }
    },
  );

  it.each([
    ['academics.timetable_publication_status', 'gradeId'],
    ['academics.timetable_publication_status', 'sectionId'],
    ['academics.timetable_publication_status', 'classroomId'],
    ['academics.curriculum_activation', 'sectionId'],
    ['academics.curriculum_activation', 'classroomId'],
  ] as const)(
    'rejects unsupported %s hierarchy input %s before repository resolution',
    async (chartKey, filter) => {
      const repository = hierarchyRepositoryMock();
      await expect(
        queryService(repository).resolve(scope(), chart(chartKey), {
          [filter]: GRADE_ID,
        }),
      ).rejects.toBeInstanceOf(ValidationDomainException);
      expect(repository.findGradeById).not.toHaveBeenCalled();
      expect(repository.findSectionById).not.toHaveBeenCalled();
      expect(repository.findClassroomById).not.toHaveBeenCalled();
    },
  );

  it.each([
    { range: '7d' },
    { granularity: 'week' },
    { granularity: 'month' },
    { dateFrom: '2026-07-01' },
    { dateTo: '2026-07-02' },
  ] as const)(
    'rejects non-compatible current-category time input %#',
    async (rawQuery) => {
      await expect(
        queryService(hierarchyRepositoryMock()).resolve(
          scope(),
          chart('admissions.applications_by_status'),
          rawQuery,
        ),
      ).rejects.toBeInstanceOf(ValidationDomainException);
    },
  );

  it('preserves legacy historical query validation for the deferred Admissions funnel', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('admissions.funnel'),
      {
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-09',
      },
    );

    expect(context.filtersApplied).toEqual([
      'range',
      'granularity',
      'dateFrom',
      'dateTo',
    ]);
  });

  it('preserves legacy time behavior for unrelated standard-filter definition-only charts', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('behavior.positive_negative_trend'),
      { range: '7d', granularity: 'day' },
    );

    expect(context.filtersApplied).toEqual(['range', 'granularity']);
    expect(context.filtersNotApplicable).toEqual([]);
  });

  it.each([
    ['neither', {}],
    ['academic year only', { academicYearId: ACADEMIC_YEAR_ID }],
    ['term only', { termId: TERM_ID }],
    ['empty academic year', { academicYearId: '', termId: TERM_ID }],
  ])(
    'rejects gradebook completion when %s required context is supplied',
    async (_label, rawQuery) => {
      const repository = hierarchyRepositoryMock();
      await expect(
        queryService(repository).resolve(
          scope(),
          chart('grades.gradebook_completion'),
          rawQuery,
        ),
      ).rejects.toBeInstanceOf(ValidationDomainException);
      expect(repository.findAcademicYearById).not.toHaveBeenCalled();
      expect(repository.findTermById).not.toHaveBeenCalled();
    },
  );

  it('accepts explicit same-school gradebook AcademicYear and Term and preserves compatibility metadata', async () => {
    const context = await queryService(hierarchyRepositoryMock()).resolve(
      scope(),
      chart('grades.gradebook_completion'),
      { academicYearId: ACADEMIC_YEAR_ID, termId: TERM_ID },
    );

    expect(context.hierarchy).toMatchObject({
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,
    });
    expect(context.filtersApplied).toEqual(['academicYearId', 'termId']);
    expect(context.filtersNotApplicable).toEqual(['range', 'granularity']);
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
