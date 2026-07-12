import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
} from '@prisma/client';
import { DashboardAdmissionsAnalyticsRepository } from '../infrastructure/dashboard-admissions-analytics.repository';

describe('DashboardAdmissionsAnalyticsRepository', () => {
  it('groups current nondeleted Applications by exact status with scoped hierarchy filters and no time predicate', async () => {
    const prisma = prismaMock();
    prisma.scoped.application.groupBy.mockResolvedValue([
      {
        status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
        _count: { _all: 2 },
      },
    ]);
    const repository = new DashboardAdmissionsAnalyticsRepository(
      prisma as any,
    );

    await expect(
      repository.countCurrentApplicationsByStatus({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        hierarchy: { academicYearId: 'year-1', gradeId: 'grade-1' },
      }),
    ).resolves.toEqual([
      { status: AdmissionApplicationStatus.DOCUMENTS_PENDING, count: 2 },
    ]);
    expect(prisma.scoped.application.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        deletedAt: null,
        requestedAcademicYearId: 'year-1',
        requestedGradeId: 'grade-1',
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    expect(
      JSON.stringify(prisma.scoped.application.groupBy.mock.calls[0][0]),
    ).not.toContain('submittedAt');
  });

  it('aggregates submittedAt and accepted decidedAt events with explicit school, soft-delete, UTC storage, and bounded half-open predicates', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { date: '2026-07-12', event: 'submitted', count: 3n },
      { date: '2026-07-12', event: 'accepted', count: 1n },
    ]);
    const repository = new DashboardAdmissionsAnalyticsRepository(
      prisma as any,
    );

    await expect(
      repository.aggregateApplicationEventsByCivilDate({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        timezone: 'Africa/Cairo',
        window: {
          startInclusive: new Date('2026-07-11T21:00:00.000Z'),
          endExclusive: new Date('2026-07-12T21:00:00.000Z'),
        },
        hierarchy: { academicYearId: 'year-1', gradeId: 'grade-1' },
      }),
    ).resolves.toEqual([
      { date: '2026-07-12', event: 'submitted', count: 3 },
      { date: '2026-07-12', event: 'accepted', count: 1 },
    ]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('a.submitted_at IS NOT NULL');
    expect(query.sql).toContain('a.submitted_at >=');
    expect(query.sql).toContain('a.submitted_at <');
    expect(query.sql).toContain('d.decided_at >=');
    expect(query.sql).toContain('d.decided_at <');
    expect(query.sql).toContain("AT TIME ZONE 'UTC'");
    expect(query.sql).toContain('INNER JOIN admission_applications a');
    expect(query.sql).toContain('a.school_id = d.school_id');
    expect(query.sql).toContain('a.deleted_at IS NULL');
    expect(query.sql).toContain('a.requested_academic_year_id = ?::uuid');
    expect(query.sql).toContain('a.requested_grade_id = ?::uuid');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'school-1',
        'Africa/Cairo',
        AdmissionDecisionType.ACCEPT,
        'year-1',
        'grade-1',
      ]),
    );
    expect(query.sql).not.toContain('updated_at');
    expect(query.sql).not.toContain('created_at');
  });
});

function prismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    scoped: {
      application: { groupBy: jest.fn().mockResolvedValue([]) },
    },
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
