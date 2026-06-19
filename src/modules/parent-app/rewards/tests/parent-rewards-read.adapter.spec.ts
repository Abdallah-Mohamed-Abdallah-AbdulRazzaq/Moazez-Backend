import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';

describe('ParentRewardsReadAdapter', () => {
  it('lists only app-visible rewards and calculates affordability from XpLedger', async () => {
    const { adapter, rewardCatalogItemMocks, xpLedgerMocks } = createAdapter();
    rewardCatalogItemMocks.findMany.mockResolvedValue([]);
    rewardCatalogItemMocks.count.mockResolvedValue(0);
    xpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 25 } });

    await adapter.listRewards(childFixture(), {
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

  it('reads only linked-child redemptions without selecting internal actor fields', async () => {
    const { adapter, rewardRedemptionMocks, xpLedgerMocks } = createAdapter();
    rewardRedemptionMocks.findMany.mockResolvedValue([]);
    rewardRedemptionMocks.groupBy.mockResolvedValue([]);
    xpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 25 } });

    await adapter.listRedemptions(childFixture());

    const query = rewardRedemptionMocks.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    });
    const selected = JSON.stringify(query.select);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'studentId',
      'enrollmentId',
      'requestedById',
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

  it('performs no reward, XP, behavior, hero, or platform bypass mutations', async () => {
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

    await adapter.listRewards(childFixture());

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

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

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

function createAdapter() {
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
    adapter: new ParentRewardsReadAdapter(prisma),
    rewardCatalogItemMocks,
    rewardRedemptionMocks,
    xpLedgerMocks,
    behaviorPointLedgerMocks,
    heroMissionProgressMocks,
    heroStudentBadgeMocks,
    platformBypass,
  };
}
