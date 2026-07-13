import { HomeworkAssignmentStatus } from '@prisma/client';
import { DashboardHomeworkAnalyticsRepository } from '../infrastructure/dashboard-homework-analytics.repository';

describe('DashboardHomeworkAnalyticsRepository', () => {
  it('groups only current non-archived assignments through one same-school hierarchy', async () => {
    const prisma = prismaMock();
    prisma.scoped.homeworkAssignment.groupBy.mockResolvedValue([
      { status: HomeworkAssignmentStatus.DRAFT, _count: { _all: 2 } },
      { status: HomeworkAssignmentStatus.CLOSED, _count: { _all: 1 } },
    ]);
    const repository = new DashboardHomeworkAnalyticsRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardHomeworkAnalyticsRepository
      >[0],
    );

    await expect(
      repository.countCurrentAssignmentStatusDistribution({
        scope: scope(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ draft: 2, published: 0, closed: 1, cancelled: 0 });

    const groupByInput = mockArgument<{
      by: string[];
      where: Record<string, unknown>;
    }>(prisma.scoped.homeworkAssignment.groupBy);
    expect(groupByInput).toMatchObject({
      by: ['status'],
      where: {
        deletedAt: null,
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: {
          in: [
            HomeworkAssignmentStatus.DRAFT,
            HomeworkAssignmentStatus.PUBLISHED,
            HomeworkAssignmentStatus.CLOSED,
            HomeworkAssignmentStatus.CANCELLED,
          ],
        },
      },
    });
    const serialized = JSON.stringify(groupByInput);
    expect(serialized).toContain('section-1');
    expect(serialized).toContain('grade-1');
    expect(serialized).toContain('school-1');
  });

  it('aggregates submittedAt and reviewedAt independently with bounded timezone-aware SQL', async () => {
    const prisma = prismaMock();
    prisma.scoped.$queryRaw.mockResolvedValue([
      { date: '2026-07-12', submitted: 2n, reviewed: 1n },
    ]);
    const repository = new DashboardHomeworkAnalyticsRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardHomeworkAnalyticsRepository
      >[0],
    );

    await expect(
      repository.aggregateSubmissionReviewEventsByCivilDate({
        scope: scope(),
        timezone: 'Africa/Cairo',
        window: {
          startInclusive: new Date('2026-07-01T00:00:00.000Z'),
          endExclusive: new Date('2026-07-13T00:00:00.000Z'),
        },
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual([
      { civilDate: '2026-07-12', submitted: 2, reviewed: 1 },
    ]);

    const query = mockArgument<{
      sql: string;
      values: unknown[];
    }>(prisma.scoped.$queryRaw);
    expect(query.sql).toContain('FROM homework_submissions hs');
    expect(query.sql).toContain('UNION ALL');
    expect(query.sql).toContain('hs.submitted_at >=');
    expect(query.sql).toContain('hs.submitted_at <');
    expect(query.sql).toContain('hs.reviewed_at >=');
    expect(query.sql).toContain('hs.reviewed_at <');
    expect(query.sql).not.toContain('ha.status');
    expect(query.sql).toContain('ha.deleted_at IS NULL');
    expect(query.sql).toContain('hs.school_id = ?::uuid');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'school-1',
        'Africa/Cairo',
        'year-1',
        'term-1',
        'grade-1',
        'section-1',
        'classroom-1',
      ]),
    );
  });

  it('counts current graded assignment links without inspecting grades or submissions', async () => {
    const prisma = prismaMock();
    prisma.scoped.homeworkAssignment.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const repository = new DashboardHomeworkAnalyticsRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardHomeworkAnalyticsRepository
      >[0],
    );

    await expect(
      repository.countCurrentGradeSyncLinkCoverage({
        scope: scope(),
        hierarchy: hierarchy(),
      }),
    ).resolves.toEqual({ linked: 3, pending: 2 });

    expect(prisma.scoped.homeworkAssignment.count).toHaveBeenCalledTimes(2);
    const calls = prisma.scoped.homeworkAssignment.count.mock
      .calls as unknown[][];
    for (const callEntry of calls) {
      const call = callEntry[0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({
        deletedAt: null,
        isGraded: true,
        status: {
          in: [
            HomeworkAssignmentStatus.DRAFT,
            HomeworkAssignmentStatus.PUBLISHED,
            HomeworkAssignmentStatus.CLOSED,
          ],
        },
      });
      expect(JSON.stringify(call.where)).not.toContain('gradeItems');
      expect(JSON.stringify(call.where)).not.toContain('submissions');
    }
  });
});

function prismaMock() {
  return {
    scoped: {
      $queryRaw: jest.fn().mockResolvedValue([]),
      homeworkAssignment: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    },
  };
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
