import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import {
  compareDashboardActivityItems,
  ListDashboardActivityFeedUseCase,
} from '../application/list-dashboard-activity-feed.use-case';
import { ListDashboardActivityFeedQueryDto } from '../dto/dashboard-activity-feed.dto';
import {
  DashboardActivityAuditRecord,
  DashboardActivityFeedRepository,
} from '../infrastructure/dashboard-activity-feed.repository';

describe('ListDashboardActivityFeedUseCase', () => {
  it('requires school scope and delegates audit loading to the repository', async () => {
    const repository = repositoryMock([]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(repository.listActivityAuditRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
      expect.objectContaining({
        take: 21,
      }),
    );
    expect(response.items).toEqual([]);
  });

  it('rejects callers without an active school scope', async () => {
    const repository = repositoryMock([]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
    expect(repository.listActivityAuditRecords).not.toHaveBeenCalled();
  });

  it('filters by source', async () => {
    const repository = repositoryMock([
      auditRecord({
        id: 'homework-1',
        module: 'homework',
        action: 'homework.submission.review',
      }),
      auditRecord({
        id: 'attendance-1',
        module: 'attendance',
        action: 'attendance.session.submit',
      }),
    ]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const response = await withSchoolScope(() =>
      useCase.execute(query({ source: 'homework' })),
    );

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      source: 'homework',
      eventType: 'homework.submission.review',
      title: 'Homework reviewed',
    });
  });

  it('filters by actorType', async () => {
    const repository = repositoryMock([
      auditRecord({
        id: 'teacher-activity',
        userType: UserType.TEACHER,
        actor: {
          firstName: 'Teacher',
          lastName: 'One',
          userType: UserType.TEACHER,
        },
      }),
      auditRecord({
        id: 'admin-activity',
        userType: UserType.SCHOOL_USER,
        actor: {
          firstName: 'Admin',
          lastName: 'One',
          userType: UserType.SCHOOL_USER,
        },
      }),
    ]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const response = await withSchoolScope(() =>
      useCase.execute(query({ actorType: 'teacher' })),
    );

    expect(response.items).toHaveLength(1);
    expect(response.items[0].actor).toEqual({
      id: 'actor-teacher-activity',
      displayName: 'Teacher One',
      type: 'teacher',
    });
  });

  it('filters by eventType', async () => {
    const repository = repositoryMock([
      auditRecord({
        id: 'published',
        action: 'homework.assignment.publish',
      }),
      auditRecord({
        id: 'reviewed',
        action: 'homework.submission.review',
      }),
    ]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const response = await withSchoolScope(() =>
      useCase.execute(query({ eventType: 'homework.assignment.publish' })),
    );

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      eventType: 'homework.assignment.publish',
      title: 'Homework published',
    });
  });

  it('validates date ranges before loading records', async () => {
    const repository = repositoryMock([]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    await expect(
      withSchoolScope(() =>
        useCase.execute(
          query({
            dateFrom: '2026-06-03T00:00:00.000Z',
            dateTo: '2026-06-01T00:00:00.000Z',
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.listActivityAuditRecords).not.toHaveBeenCalled();
  });

  it('applies the default limit and max limit', async () => {
    const records = Array.from({ length: 101 }, (_, index) =>
      auditRecord({
        id: `activity-${index.toString().padStart(3, '0')}`,
        createdAt: new Date(
          `2026-06-01T09:${String(index % 60).padStart(2, '0')}:00.000Z`,
        ),
      }),
    );
    const repository = repositoryMock(records);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const defaultLimited = await withSchoolScope(() => useCase.execute());
    const maxLimited = await withSchoolScope(() =>
      useCase.execute(query({ limit: 500 })),
    );

    expect(defaultLimited.items).toHaveLength(20);
    expect(defaultLimited.pageInfo.limit).toBe(20);
    expect(maxLimited.items).toHaveLength(100);
    expect(maxLimited.pageInfo.limit).toBe(100);
  });

  it('sorts by occurredAt descending and then stable activity id', async () => {
    const repository = repositoryMock([
      auditRecord({
        id: 'bbb',
        createdAt: new Date('2026-06-01T09:00:00.000Z'),
      }),
      auditRecord({
        id: 'newer',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
      }),
      auditRecord({
        id: 'aaa',
        createdAt: new Date('2026-06-01T09:00:00.000Z'),
      }),
    ]);
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.items.map((item) => item.activityId)).toEqual([
      'audit:newer',
      'audit:aaa',
      'audit:bbb',
    ]);
    expect([...response.items].sort(compareDashboardActivityItems)).toEqual(
      response.items,
    );
  });

  it('returns stable pageInfo with nextCursor when more items exist', async () => {
    const repository = repositoryMock(
      Array.from({ length: 21 }, (_, index) =>
        auditRecord({
          id: `activity-${index.toString().padStart(2, '0')}`,
          createdAt: new Date(
            `2026-06-01T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
          ),
        }),
      ),
    );
    const useCase = new ListDashboardActivityFeedUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.pageInfo.limit).toBe(20);
    expect(response.pageInfo.hasMore).toBe(true);
    expect(response.pageInfo.nextCursor).toEqual(expect.any(String));
    expect(response.items).toHaveLength(20);
  });
});

async function withSchoolScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.activity_feed.view'],
    });

    return fn();
  });
}

function query(
  overrides: Partial<ListDashboardActivityFeedQueryDto>,
): ListDashboardActivityFeedQueryDto {
  return Object.assign(new ListDashboardActivityFeedQueryDto(), overrides);
}

function repositoryMock(
  records: DashboardActivityAuditRecord[],
): jest.Mocked<
  Pick<DashboardActivityFeedRepository, 'listActivityAuditRecords'>
> {
  return {
    listActivityAuditRecords: jest.fn().mockResolvedValue(records),
  };
}

function auditRecord(
  overrides: Partial<DashboardActivityAuditRecord> = {},
): DashboardActivityAuditRecord {
  const id = overrides.id ?? 'activity-1';

  return {
    id,
    actorId: `actor-${id}`,
    userType: UserType.TEACHER,
    module: 'homework',
    action: 'homework.submission.review',
    resourceType: 'homework_submission',
    resourceId: `resource-${id}`,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    actor: {
      firstName: 'Teacher',
      lastName: 'One',
      userType: UserType.TEACHER,
    },
    ...overrides,
  };
}
