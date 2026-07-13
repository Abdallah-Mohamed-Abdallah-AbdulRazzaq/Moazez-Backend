import { DashboardGradesAnalyticsRepository } from '../infrastructure/dashboard-grades-analytics.repository';

describe('DashboardGradesAnalyticsRepository', () => {
  it('aggregates assessment workflow status with locked precedence and scoped applicability', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { draft: 1n, published: 2n, approved: 3n, locked: 4n },
    ]);
    const repository = new DashboardGradesAnalyticsRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardGradesAnalyticsRepository
      >[0],
    );

    await expect(
      repository.countCurrentAssessmentStatusDistribution({
        scope: scope(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ draft: 1, published: 2, approved: 3, locked: 4 });

    const query = rawQuery(prisma, 0);
    expect(query.sql).toContain('FROM grade_assessments ga');
    expect(query.sql).toContain('ga.school_id = ?::uuid');
    expect(query.sql).toContain('ga.deleted_at IS NULL');
    expect(query.sql).toContain('ga.locked_at IS NULL');
    expect(query.sql).toContain('ga.locked_at IS NOT NULL');
    expect(query.sql).toContain('FROM classrooms c');
    expect(query.sql).toContain('c.deleted_at IS NULL');
    expect(query.sql).toContain('sec.deleted_at IS NULL');
    expect(query.sql).toContain('g.deleted_at IS NULL');
    expect(query.sql).toContain('st.deleted_at IS NULL');
    expect(query.sql).toContain('ga.scope_key = sp.stage_id');
    expect(query.sql).toContain('ga.scope_key = sp.grade_id');
    expect(query.sql).toContain('ga.scope_key = sp.section_id');
    expect(query.sql).toContain('ga.scope_key = sp.classroom_id');
    expect(query.values).toEqual(
      expect.arrayContaining(['school-1', 'year-1', 'term-1', 'classroom-1']),
    );
  });

  it('builds a deduplicated active Enrollment x applicable Assessment gradebook denominator', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([{ complete: 7n, missing: 2n }]);
    const repository = new DashboardGradesAnalyticsRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardGradesAnalyticsRepository
      >[0],
    );

    await expect(
      repository.countCurrentGradebookCompletion({
        scope: scope(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ complete: 7, missing: 2 });

    const query = rawQuery(prisma, 0);
    expect(query.sql).toContain('WITH qualifying_enrollments AS');
    expect(query.sql).toContain('SELECT DISTINCT');
    expect(query.sql).toContain('e.school_id = ?::uuid');
    expect(query.sql).toContain('e.deleted_at IS NULL');
    expect(query.sql).toContain('s.deleted_at IS NULL');
    expect(query.sql).toContain('c.deleted_at IS NULL');
    expect(query.sql).toContain('e.term_id = ?::uuid OR e.term_id IS NULL');
    expect(query.sql).toContain('qualifying_assessments AS');
    expect(query.sql).toContain('ga.deleted_at IS NULL');
    expect(query.sql).toContain('grade_item_state AS');
    expect(query.sql).toContain('BOOL_OR');
    expect(query.sql).toContain('gis.assessment_id = ec.assessment_id');
    expect(query.sql).toContain('gis.student_id = ec.student_id');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'ACTIVE',
        'PUBLISHED',
        'APPROVED',
        'ENTERED',
        'ABSENT',
        'year-1',
        'term-1',
      ]),
    );
  });
});

function prismaMock() {
  return { scoped: { $queryRaw: jest.fn().mockResolvedValue([]) } };
}

function rawQuery(prisma: ReturnType<typeof prismaMock>, index: number) {
  return mockArgument<{
    sql: string;
    values: unknown[];
  }>(prisma.scoped.$queryRaw, index);
}

function mockArgument<T>(
  mockFn: { mock: { calls: unknown[][] } },
  index = 0,
): T {
  return mockFn.mock.calls[index]?.[0] as T;
}

function scope() {
  return {
    actorId: 'actor-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    roleId: 'role-1',
    userType: 'SCHOOL_USER' as const,
  };
}

function hierarchy() {
  return {
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    sectionId: 'section-1',
    classroomId: 'classroom-1',
  };
}
