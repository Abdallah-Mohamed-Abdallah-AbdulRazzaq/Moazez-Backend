import { DashboardBehaviorAnalyticsRepository } from '../infrastructure/dashboard-behavior-analytics.repository';

describe('DashboardBehaviorAnalyticsRepository', () => {
  it('aggregates only approved nondeleted records by school civil date and persisted Enrollment hierarchy', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { date: '2026-07-12', positive: 2n, negative: 1n },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.aggregateApprovedRecordTypesByCivilDate({
        scope: scope(),
        timezone: 'Africa/Cairo',
        window: window(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual([{ civilDate: '2026-07-12', positive: 2, negative: 1 }]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM behavior_records br');
    expect(query.sql).toContain('br.school_id = ?::uuid');
    expect(query.sql).toContain('br.deleted_at IS NULL');
    expect(query.sql).toContain('br.status = ?::behavior_record_status');
    expect(query.sql).toContain('br.occurred_at >=');
    expect(query.sql).toContain('br.occurred_at <');
    expect(query.sql).toContain('e.id = br.enrollment_id');
    expect(query.sql).toContain('e.deleted_at IS NULL');
    expect(query.sql).toContain('c.deleted_at IS NULL');
    expect(query.sql).not.toContain('e.status');
    expect(query.sql).not.toContain('behavior_point_ledger');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'school-1',
        'Africa/Cairo',
        'APPROVED',
        'POSITIVE',
        'NEGATIVE',
        'year-1',
        'term-1',
        'grade-1',
        'section-1',
        'classroom-1',
      ]),
    );
  });

  it('counts current SUBMITTED records without applying a time window', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([{ pendingReview: 4n }]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.countCurrentPendingReview({
        scope: scope(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toBe(4);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('COUNT(*)::bigint AS "pendingReview"');
    expect(query.sql).toContain('br.status = ?::behavior_record_status');
    expect(query.values).toContain('SUBMITTED');
    expect(query.sql).not.toContain('br.occurred_at >=');
    expect(query.sql).not.toContain('student_enrollment_status');
  });

  it('groups approved in-window records by safe label with deleted and missing categories uncategorized', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { label: 'Respect', count: 3n },
      { label: 'Uncategorized', count: 1n },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.countApprovedRecordsByCategory({
        scope: scope(),
        window: window(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual([
      { label: 'Respect', count: 3 },
      { label: 'Uncategorized', count: 1 },
    ]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('LEFT JOIN behavior_categories bc');
    expect(query.sql).toContain('bc.deleted_at IS NULL');
    expect(query.sql).toContain("'Uncategorized'");
    expect(query.sql).toContain('GROUP BY label');
    expect(query.sql).toContain('ORDER BY count DESC, label ASC');
    expect(query.sql).not.toContain('SELECT br.id');
    expect(query.sql).not.toContain('SELECT bc.id');
  });
});

function prismaMock() {
  return {
    scoped: {
      $queryRaw: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
    },
  };
}

function repositoryWith(prisma: ReturnType<typeof prismaMock>) {
  return new DashboardBehaviorAnalyticsRepository(
    prisma as unknown as ConstructorParameters<
      typeof DashboardBehaviorAnalyticsRepository
    >[0],
  );
}

function rawQuery(prisma: ReturnType<typeof prismaMock>) {
  return prisma.scoped.$queryRaw.mock.calls[0]?.[0] as {
    sql: string;
    values: unknown[];
  };
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

function window() {
  return {
    startInclusive: new Date('2026-07-01T00:00:00.000Z'),
    endExclusive: new Date('2026-07-13T00:00:00.000Z'),
  };
}
