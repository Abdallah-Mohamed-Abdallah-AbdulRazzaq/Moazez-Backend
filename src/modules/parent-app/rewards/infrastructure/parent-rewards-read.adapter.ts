import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type { ParentRewardsQueryDto } from '../dto/parent-rewards.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const PARENT_REWARD_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const PARENT_REWARD_CATALOG_ARGS =
  Prisma.validator<Prisma.RewardCatalogItemDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      titleEn: true,
      titleAr: true,
      descriptionEn: true,
      descriptionAr: true,
      type: true,
      status: true,
      minTotalXp: true,
      stockRemaining: true,
      isUnlimited: true,
      imageFileId: true,
      publishedAt: true,
      imageFile: {
        select: PARENT_REWARD_FILE_SELECT,
      },
    },
  });

const PARENT_REWARD_REDEMPTION_ARGS =
  Prisma.validator<Prisma.RewardRedemptionDefaultArgs>()({
    select: {
      id: true,
      catalogItemId: true,
      status: true,
      requestSource: true,
      requestedAt: true,
      reviewedAt: true,
      fulfilledAt: true,
      cancelledAt: true,
      requestNoteEn: true,
      requestNoteAr: true,
      catalogItem: PARENT_REWARD_CATALOG_ARGS,
    },
  });

export type ParentRewardCatalogReadModel = Prisma.RewardCatalogItemGetPayload<
  typeof PARENT_REWARD_CATALOG_ARGS
>;
export type ParentRewardRedemptionReadModel =
  Prisma.RewardRedemptionGetPayload<typeof PARENT_REWARD_REDEMPTION_ARGS>;

export interface ParentRewardsListReadModel {
  child: ParentAppAccessibleChild;
  rewards: ParentRewardCatalogReadModel[];
  total: number;
  page: number;
  limit: number;
  totalEarnedXp: number;
}

export interface ParentRewardDetailReadModel {
  child: ParentAppAccessibleChild;
  reward: ParentRewardCatalogReadModel;
  totalEarnedXp: number;
}

export interface ParentRewardRedemptionsReadModel {
  child: ParentAppAccessibleChild;
  redemptions: ParentRewardRedemptionReadModel[];
  statusCounts: Partial<Record<RewardRedemptionStatus, number>>;
  totalEarnedXp: number;
}

export interface ParentRewardRedemptionDetailReadModel {
  child: ParentAppAccessibleChild;
  redemption: ParentRewardRedemptionReadModel;
  totalEarnedXp: number;
}

@Injectable()
export class ParentRewardsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listRewards(
    child: ParentAppAccessibleChild,
    query?: ParentRewardsQueryDto,
  ): Promise<ParentRewardsListReadModel> {
    const page = resolvePage(query?.page);
    const limit = resolveLimit(query?.limit);
    const where = buildVisibleRewardWhere({ child, type: query?.type });

    const [rewards, total, totalEarnedXp] = await Promise.all([
      this.scopedPrisma.rewardCatalogItem.findMany({
        where,
        orderBy: [
          { sortOrder: 'asc' },
          { publishedAt: 'desc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        ...PARENT_REWARD_CATALOG_ARGS,
      }),
      this.scopedPrisma.rewardCatalogItem.count({ where }),
      this.calculateTotalEarnedXp(child),
    ]);

    return { child, rewards, total, page, limit, totalEarnedXp };
  }

  async findReward(params: {
    child: ParentAppAccessibleChild;
    rewardId: string;
  }): Promise<ParentRewardDetailReadModel | null> {
    const reward = await this.scopedPrisma.rewardCatalogItem.findFirst({
      where: {
        ...buildVisibleRewardWhere({ child: params.child }),
        id: params.rewardId,
      },
      ...PARENT_REWARD_CATALOG_ARGS,
    });

    if (!reward) return null;

    return {
      child: params.child,
      reward,
      totalEarnedXp: await this.calculateTotalEarnedXp(params.child),
    };
  }

  async listRedemptions(
    child: ParentAppAccessibleChild,
  ): Promise<ParentRewardRedemptionsReadModel> {
    const where = buildChildRedemptionWhere(child);
    const [redemptions, statusGroups, totalEarnedXp] = await Promise.all([
      this.scopedPrisma.rewardRedemption.findMany({
        where,
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
        ...PARENT_REWARD_REDEMPTION_ARGS,
      }),
      this.scopedPrisma.rewardRedemption.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.calculateTotalEarnedXp(child),
    ]);

    return {
      child,
      redemptions,
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.status, group._count._all]),
      ),
      totalEarnedXp,
    };
  }

  async findRedemption(params: {
    child: ParentAppAccessibleChild;
    redemptionId: string;
  }): Promise<ParentRewardRedemptionDetailReadModel | null> {
    const redemption = await this.scopedPrisma.rewardRedemption.findFirst({
      where: {
        ...buildChildRedemptionWhere(params.child),
        id: params.redemptionId,
      },
      ...PARENT_REWARD_REDEMPTION_ARGS,
    });

    if (!redemption) return null;

    return {
      child: params.child,
      redemption,
      totalEarnedXp: await this.calculateTotalEarnedXp(params.child),
    };
  }

  private async calculateTotalEarnedXp(
    child: ParentAppAccessibleChild,
  ): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        studentId: child.studentId,
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    return Math.max(0, result._sum.amount ?? 0);
  }
}

function buildVisibleRewardWhere(params: {
  child: ParentAppAccessibleChild;
  type?: string;
}): Prisma.RewardCatalogItemWhereInput {
  return {
    status: RewardCatalogItemStatus.PUBLISHED,
    deletedAt: null,
    ...(params.type ? { type: normalizeRewardType(params.type) } : {}),
    OR: [
      { academicYearId: null },
      { academicYearId: params.child.academicYearId },
    ],
    AND: [
      {
        OR: [
          { termId: null },
          ...(params.child.termId ? [{ termId: params.child.termId }] : []),
        ],
      },
      {
        OR: [{ isUnlimited: true }, { stockRemaining: { gt: 0 } }],
      },
    ],
  };
}

function buildChildRedemptionWhere(
  child: ParentAppAccessibleChild,
): Prisma.RewardRedemptionWhereInput {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    academicYearId: child.academicYearId,
    ...(child.termId ? { termId: child.termId } : {}),
  };
}

function normalizeRewardType(type: string): RewardCatalogItemType {
  return type.trim().toUpperCase() as RewardCatalogItemType;
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(1, Math.trunc(page));
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}
