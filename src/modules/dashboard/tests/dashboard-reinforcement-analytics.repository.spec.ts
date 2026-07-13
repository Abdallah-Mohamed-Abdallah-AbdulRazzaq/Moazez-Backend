import { DashboardReinforcementAnalyticsRepository } from '../infrastructure/dashboard-reinforcement-analytics.repository';

describe('DashboardReinforcementAnalyticsRepository', () => {
  it('sums net XpLedger activity by school civil date without clamping or unrelated sources', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { date: '2026-07-12', xp: -7n },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.aggregateXpActivityByCivilDate({
        scope: scope(),
        timezone: 'Africa/Cairo',
        window: window(),
        hierarchy: {
          ...hierarchy(),
          gradeId: null,
          sectionId: null,
          classroomId: null,
        },
      }),
    ).resolves.toEqual([{ civilDate: '2026-07-12', xp: -7 }]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM xp_ledger xl');
    expect(query.sql).toContain('SUM(xl.amount)::bigint AS xp');
    expect(query.sql).toContain('xl.school_id = ?::uuid');
    expect(query.sql).toContain('xl.occurred_at >=');
    expect(query.sql).toContain('xl.occurred_at <');
    expect(query.sql).not.toContain('student_enrollments');
    expect(query.sql).not.toContain('GREATEST');
    expect(query.sql).not.toContain('behavior_point_ledger');
    expect(query.sql).not.toContain('reinforcement_reviews');
    expect(query.values).toEqual(
      expect.arrayContaining(['school-1', 'Africa/Cairo', 'year-1', 'term-1']),
    );
  });

  it('applies lower XP hierarchy only through the persisted optional Enrollment', async () => {
    const prisma = prismaMock();
    const repository = repositoryWith(prisma);
    await repository.aggregateXpActivityByCivilDate({
      scope: scope(),
      timezone: 'UTC',
      window: window(),
      hierarchy: hierarchy(),
    });

    const query = rawQuery(prisma);
    expect(query.sql).toContain('e.id = xl.enrollment_id');
    expect(query.sql).toContain('e.school_id = xl.school_id');
    expect(query.sql).toContain('e.deleted_at IS NULL');
    expect(query.sql).not.toContain('e.status');
    expect(query.values).toEqual(
      expect.arrayContaining(['grade-1', 'section-1', 'classroom-1']),
    );
  });

  it('classifies each current assignment once with completed then overdue precedence', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { completed: 2n, pending: 3n, overdue: 4n },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.countCurrentAssignmentCompletion({
        scope: scope(),
        generatedAt: new Date('2026-07-12T12:00:00.000Z'),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ completed: 2, pending: 3, overdue: 4 });

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM reinforcement_assignments ra');
    expect(query.sql).toContain('INNER JOIN reinforcement_tasks rt');
    expect(query.sql).toContain('rt.deleted_at IS NULL');
    expect(query.sql).toContain('ra.status <> ?::reinforcement_task_status');
    expect(query.sql).toContain('rt.status <> ?::reinforcement_task_status');
    expect(query.sql).toContain('rt.due_date <');
    expect(query.sql).toContain('rt.due_date >=');
    expect(query.sql).toContain('e.id = ra.enrollment_id');
    expect(query.sql).not.toContain('reinforcement_task_stages');
    expect(query.sql).not.toContain('reinforcement_submissions');
    expect(query.sql).not.toContain('reinforcement_reviews');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'COMPLETED',
        'NOT_COMPLETED',
        'IN_PROGRESS',
        'UNDER_REVIEW',
        'CANCELLED',
        'school-1',
      ]),
    );
  });

  it('counts a cumulative request-cohort redemption funnel without catalog-state predicates', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { requested: 8n, approved: 5n, fulfilled: 2n },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.countRewardRedemptionFunnel({
        scope: scope(),
        window: window(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ requested: 8, approved: 5, fulfilled: 2 });

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM reward_redemptions rr');
    expect(query.sql).toContain('rr.requested_at >=');
    expect(query.sql).toContain('rr.requested_at <');
    expect(query.sql).toContain('e.id = rr.enrollment_id');
    expect(query.sql).not.toContain('reward_catalog_items');
    expect(query.sql).not.toContain('catalog_item_id');
    expect(query.values).toEqual(
      expect.arrayContaining(['APPROVED', 'FULFILLED', 'school-1']),
    );
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
  return new DashboardReinforcementAnalyticsRepository(
    prisma as unknown as ConstructorParameters<
      typeof DashboardReinforcementAnalyticsRepository
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
