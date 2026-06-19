import { RewardCatalogItemStatus, RewardCatalogItemType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';

describe('StudentRewardsReadAdapter', () => {
  it('lists only app-visible published rewards and calculates affordability from XpLedger', async () => {
    const { adapter, rewardCatalogItemMocks, xpLedgerMocks } = createAdapter();
    rewardCatalogItemMocks.findMany.mockResolvedValue([]);
    rewardCatalogItemMocks.count.mockResolvedValue(0);
    xpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 25 } });

    await adapter.listRewards(contextFixture(), {
      type: 'privilege',
      page: 1,
      limit: 25,
    });

    const query = rewardCatalogItemMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      status: RewardCatalogItemStatus.PUBLISHED,
      deletedAt: null,
      type: RewardCatalogItemType.PRIVILEGE,
    });
    expect(JSON.stringify(query.where)).toContain('academicYearId');
    expect(JSON.stringify(query.where)).toContain('termId');
    expect(JSON.stringify(query.where)).toContain('stockRemaining');
    expect(xpLedgerMocks.aggregate).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });
  });

  it('reads only the current student redemptions without selecting internal actor fields', async () => {
    const { adapter, rewardRedemptionMocks, xpLedgerMocks } = createAdapter();
    rewardRedemptionMocks.findMany.mockResolvedValue([]);
    rewardRedemptionMocks.groupBy.mockResolvedValue([]);
    xpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 25 } });

    await adapter.listRedemptions(contextFixture());

    const query = rewardRedemptionMocks.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    });
    const selected = JSON.stringify(query.select);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'studentId',
      'enrollmentId',
      'createdById',
      'updatedById',
      'approvedById',
      'rejectedById',
      'fulfilledById',
      'cancelledById',
      'eligibilitySnapshot',
      'metadata',
      'bucket',
      'objectKey',
      'signedUrl',
    ]) {
      expect(selected).not.toContain(forbidden);
    }
  });

  it('performs no reward, XP, behavior, hero, wallet, or platform bypass mutations', async () => {
    const {
      adapter,
      rewardCatalogItemMocks,
      rewardRedemptionMocks,
      xpLedgerMocks,
      behaviorPointLedgerMocks,
      heroMissionProgressMocks,
      heroStudentBadgeMocks,
      platformBypass,
    } = createAdapter();
    rewardCatalogItemMocks.findMany.mockResolvedValue([]);
    rewardCatalogItemMocks.count.mockResolvedValue(0);
    xpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    await adapter.listRewards(contextFixture());

    expect(rewardCatalogItemMocks.create).not.toHaveBeenCalled();
    expect(rewardCatalogItemMocks.update).not.toHaveBeenCalled();
    expect(rewardRedemptionMocks.create).not.toHaveBeenCalled();
    expect(rewardRedemptionMocks.update).not.toHaveBeenCalled();
    expect(xpLedgerMocks.create).not.toHaveBeenCalled();
    expect(behaviorPointLedgerMocks.findMany).not.toHaveBeenCalled();
    expect(behaviorPointLedgerMocks.create).not.toHaveBeenCalled();
    expect(heroMissionProgressMocks.create).not.toHaveBeenCalled();
    expect(heroStudentBadgeMocks.create).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentRewardsReadAdapter;
  rewardCatalogItemMocks: ReturnType<typeof modelMocks>;
  rewardRedemptionMocks: ReturnType<typeof modelMocks>;
  xpLedgerMocks: ReturnType<typeof modelMocks>;
  behaviorPointLedgerMocks: ReturnType<typeof modelMocks>;
  heroMissionProgressMocks: ReturnType<typeof modelMocks>;
  heroStudentBadgeMocks: ReturnType<typeof modelMocks>;
  platformBypass: jest.Mock;
} {
  const rewardCatalogItemMocks = modelMocks();
  const rewardRedemptionMocks = modelMocks();
  const xpLedgerMocks = modelMocks();
  const behaviorPointLedgerMocks = modelMocks();
  const heroMissionProgressMocks = modelMocks();
  const heroStudentBadgeMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      rewardCatalogItem: rewardCatalogItemMocks,
      rewardRedemption: rewardRedemptionMocks,
      xpLedger: xpLedgerMocks,
      behaviorPointLedger: behaviorPointLedgerMocks,
      heroMissionProgress: heroMissionProgressMocks,
      heroStudentBadge: heroStudentBadgeMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentRewardsReadAdapter(prisma),
    rewardCatalogItemMocks,
    rewardRedemptionMocks,
    xpLedgerMocks,
    behaviorPointLedgerMocks,
    heroMissionProgressMocks,
    heroStudentBadgeMocks,
    platformBypass,
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}
