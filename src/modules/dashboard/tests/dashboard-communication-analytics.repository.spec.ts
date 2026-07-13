import { CommunicationAnnouncementStatus } from '@prisma/client';
import { DashboardCommunicationAnalyticsRepository } from '../infrastructure/dashboard-communication-analytics.repository';

describe('DashboardCommunicationAnalyticsRepository', () => {
  it('aggregates sentAt message rows with explicit school, parent soft-delete, window, and persisted hierarchy predicates', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { date: '2026-07-12', messages: 3n },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.aggregateMessageVolumeByCivilDate({
        scope: scope(),
        timezone: 'Africa/Cairo',
        window: window(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual([{ civilDate: '2026-07-12', messages: 3 }]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM communication_messages cm');
    expect(query.sql).toContain('INNER JOIN communication_conversations cc');
    expect(query.sql).toContain('cm.school_id = ?::uuid');
    expect(query.sql).toContain('cc.school_id = ?::uuid');
    expect(query.sql).toContain('cc.deleted_at IS NULL');
    expect(query.sql).toContain('cm.sent_at >=');
    expect(query.sql).toContain('cm.sent_at <');
    expect(query.sql).toContain('cc.academic_year_id = ?::uuid');
    expect(query.sql).toContain('cc.term_id = ?::uuid');
    expect(query.sql).toContain('cc.grade_id = ?::uuid');
    expect(query.sql).toContain('cc.section_id = ?::uuid');
    expect(query.sql).toContain('cc.classroom_id = ?::uuid');
    expect(query.sql).not.toContain('cm.status');
    expect(query.sql).not.toContain('cc.status');
    expect(query.sql).not.toContain('cm.deleted_at');
    expect(query.sql).not.toContain('communication_message_deliveries');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'Africa/Cairo',
        'school-1',
        'year-1',
        'term-1',
        'grade-1',
        'section-1',
        'classroom-1',
      ]),
    );
  });

  it('uses one scoped groupBy and maps all five announcement statuses once', async () => {
    const prisma = prismaMock();
    prisma.scoped.communicationAnnouncement.groupBy.mockResolvedValue([
      {
        status: CommunicationAnnouncementStatus.DRAFT,
        _count: { _all: 1 },
      },
      {
        status: CommunicationAnnouncementStatus.SCHEDULED,
        _count: { _all: 2 },
      },
      {
        status: CommunicationAnnouncementStatus.PUBLISHED,
        _count: { _all: 3 },
      },
      {
        status: CommunicationAnnouncementStatus.ARCHIVED,
        _count: { _all: 4 },
      },
      {
        status: CommunicationAnnouncementStatus.CANCELLED,
        _count: { _all: 5 },
      },
    ]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.countCurrentAnnouncementsByStatus({ scope: scope() }),
    ).resolves.toEqual({
      draft: 1,
      scheduled: 2,
      published: 3,
      archived: 4,
      cancelled: 5,
    });

    expect(
      prisma.scoped.communicationAnnouncement.groupBy,
    ).toHaveBeenCalledTimes(1);
    expect(
      prisma.scoped.communicationAnnouncement.groupBy,
    ).toHaveBeenCalledWith({
      by: ['status'],
      where: { schoolId: 'school-1' },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    expect(prisma.scoped.$queryRaw).not.toHaveBeenCalled();
  });

  it('zero-fills announcement statuses absent from the aggregate rows', async () => {
    const prisma = prismaMock();
    prisma.scoped.communicationAnnouncement.groupBy.mockResolvedValue([]);
    const repository = repositoryWith(prisma);

    await expect(
      repository.countCurrentAnnouncementsByStatus({ scope: scope() }),
    ).resolves.toEqual({
      draft: 0,
      scheduled: 0,
      published: 0,
      archived: 0,
      cancelled: 0,
    });
  });
});

function prismaMock() {
  return {
    scoped: {
      $queryRaw: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
      communicationAnnouncement: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    },
  };
}

function repositoryWith(prisma: ReturnType<typeof prismaMock>) {
  return new DashboardCommunicationAnalyticsRepository(
    prisma as unknown as ConstructorParameters<
      typeof DashboardCommunicationAnalyticsRepository
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
