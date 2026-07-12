import { StudentEnrollmentStatus, StudentStatus } from '@prisma/client';
import { DashboardStudentsAnalyticsRepository } from '../infrastructure/dashboard-students-analytics.repository';

describe('DashboardStudentsAnalyticsRepository', () => {
  it('counts bounded stock evaluations with exact completed/current lifecycle operators and historical hierarchy predicates', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { key: '2026-07-01', count: 4n },
      { key: '2026-07-02', count: 5n },
    ]);
    const repository = new DashboardStudentsAnalyticsRepository(prisma as any);

    await expect(
      repository.countActiveEnrollmentsAtBucketCloses({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        evaluations: [
          {
            key: '2026-07-01',
            instant: new Date('2026-07-02T00:00:00.000Z'),
            kind: 'completed_bucket',
          },
          {
            key: '2026-07-02',
            instant: new Date('2026-07-02T12:00:00.000Z'),
            kind: 'current_partial',
          },
        ],
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual([
      { key: '2026-07-01', count: 4 },
      { key: '2026-07-02', count: 5 },
    ]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('WITH evaluation_points');
    expect(query.sql).toContain('e.enrolled_at <= ep.evaluation_at');
    expect(query.sql).toContain('e.ended_at > ep.evaluation_at');
    expect(query.sql).toContain('e.enrolled_at < ep.evaluation_at');
    expect(query.sql).toContain('e.ended_at >= ep.evaluation_at');
    expect(query.sql).toContain('e.school_id = ?::uuid');
    expect(query.sql).toContain('s.school_id = ?::uuid');
    expect(query.sql).toContain('e.deleted_at IS NULL');
    expect(query.sql).toContain('s.deleted_at IS NULL');
    expect(query.sql).toContain('e.academic_year_id = ?::uuid');
    expect(query.sql).toContain('e.term_id = ?::uuid');
    expect(query.sql).toContain('e.classroom_id = ?::uuid');
    expect(query.sql).toContain('sec.id = ?::uuid');
    expect(query.sql).toContain('sec.grade_id = ?::uuid');
    expect(query.sql).not.toContain('s.status');
  });

  it('aggregates only withdrawn endedAt events with explicit school, student, soft-delete, range, and hierarchy predicates', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([{ date: '2026-07-10', count: 2n }]);
    const repository = new DashboardStudentsAnalyticsRepository(prisma as any);

    await expect(
      repository.aggregateWithdrawalsByCivilDate({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        timezone: 'UTC',
        window: {
          startInclusive: new Date('2026-07-01T00:00:00.000Z'),
          endExclusive: new Date('2026-08-01T00:00:00.000Z'),
        },
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual([{ date: '2026-07-10', count: 2 }]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('e.status = ?::student_enrollment_status');
    expect(query.values).toContain(StudentEnrollmentStatus.WITHDRAWN);
    expect(query.sql).toContain('e.ended_at IS NOT NULL');
    expect(query.sql).toContain('e.ended_at >=');
    expect(query.sql).toContain('e.ended_at <');
    expect(query.sql).not.toContain('updated_at');
  });

  it('counts distinct active Students and applies hierarchy only through one matching active Enrollment', async () => {
    const prisma = prismaMock();
    prisma.scoped.student.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(5);
    const repository = new DashboardStudentsAnalyticsRepository(prisma as any);

    await expect(
      repository.countCurrentGuardianCoverage({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ covered: 5, missing: 2 });

    const population = prisma.scoped.student.count.mock.calls[0][0];
    const covered = prisma.scoped.student.count.mock.calls[1][0];
    expect(population.where).toMatchObject({
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      enrollments: {
        some: {
          schoolId: 'school-1',
          deletedAt: null,
          status: StudentEnrollmentStatus.ACTIVE,
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
        },
      },
    });
    expect(covered.where.guardians).toEqual({
      some: {
        schoolId: 'school-1',
        guardian: { is: { schoolId: 'school-1', deletedAt: null } },
      },
    });
  });

  it('does not require an active Enrollment for unfiltered guardian coverage', async () => {
    const prisma = prismaMock();
    const repository = new DashboardStudentsAnalyticsRepository(prisma as any);

    await repository.countCurrentGuardianCoverage({
      scope: { schoolId: 'school-1', organizationId: 'org-1' },
      hierarchy: emptyHierarchy(),
    });

    expect(
      prisma.scoped.student.count.mock.calls[0][0].where,
    ).not.toHaveProperty('enrollments');
  });
});

function prismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    scoped: { student: { count: jest.fn().mockResolvedValue(0) } },
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

function emptyHierarchy() {
  return {
    academicYearId: null,
    termId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
  };
}

function rawQuery(prisma: ReturnType<typeof prismaMock>): {
  sql: string;
  values: unknown[];
} {
  return prisma.$queryRaw.mock.calls[0][0] as {
    sql: string;
    values: unknown[];
  };
}
