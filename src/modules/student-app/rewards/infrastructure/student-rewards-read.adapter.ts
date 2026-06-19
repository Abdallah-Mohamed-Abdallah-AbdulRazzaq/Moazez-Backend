import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import type { StudentRewardsQueryDto } from '../dto/student-rewards.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const STUDENT_REWARD_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const STUDENT_REWARD_CATALOG_ARGS =
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
        select: STUDENT_REWARD_FILE_SELECT,
      },
    },
  });

const STUDENT_REWARD_REDEMPTION_ARGS =
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
      catalogItem: STUDENT_REWARD_CATALOG_ARGS,
    },
  });

export type StudentRewardCatalogReadModel = Prisma.RewardCatalogItemGetPayload<
  typeof STUDENT_REWARD_CATALOG_ARGS
>;
export type StudentRewardRedemptionReadModel =
  Prisma.RewardRedemptionGetPayload<typeof STUDENT_REWARD_REDEMPTION_ARGS>;

export interface StudentRewardsListReadModel {
  rewards: StudentRewardCatalogReadModel[];
  total: number;
  page: number;
  limit: number;
  totalEarnedXp: number;
}

export interface StudentRewardDetailReadModel {
  reward: StudentRewardCatalogReadModel;
  totalEarnedXp: number;
}

export interface StudentRewardRedemptionsReadModel {
  redemptions: StudentRewardRedemptionReadModel[];
  statusCounts: Partial<Record<RewardRedemptionStatus, number>>;
  totalEarnedXp: number;
}

export interface StudentRewardRedemptionDetailReadModel {
  redemption: StudentRewardRedemptionReadModel;
  totalEarnedXp: number;
}

@Injectable()
export class StudentRewardsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listRewards(
    context: StudentAppContext,
    query?: StudentRewardsQueryDto,
  ): Promise<StudentRewardsListReadModel> {
    const page = resolvePage(query?.page);
    const limit = resolveLimit(query?.limit);
    const where = buildVisibleRewardWhere({ context, type: query?.type });

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
        ...STUDENT_REWARD_CATALOG_ARGS,
      }),
      this.scopedPrisma.rewardCatalogItem.count({ where }),
      this.calculateTotalEarnedXp(context),
    ]);

    return { rewards, total, page, limit, totalEarnedXp };
  }

  async findReward(params: {
    context: StudentAppContext;
    rewardId: string;
  }): Promise<StudentRewardDetailReadModel | null> {
    const reward = await this.scopedPrisma.rewardCatalogItem.findFirst({
      where: {
        ...buildVisibleRewardWhere({ context: params.context }),
        id: params.rewardId,
      },
      ...STUDENT_REWARD_CATALOG_ARGS,
    });

    if (!reward) return null;

    return {
      reward,
      totalEarnedXp: await this.calculateTotalEarnedXp(params.context),
    };
  }

  async listRedemptions(
    context: StudentAppContext,
  ): Promise<StudentRewardRedemptionsReadModel> {
    const where = buildOwnRedemptionWhere(context);
    const [redemptions, statusGroups, totalEarnedXp] = await Promise.all([
      this.scopedPrisma.rewardRedemption.findMany({
        where,
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
        ...STUDENT_REWARD_REDEMPTION_ARGS,
      }),
      this.scopedPrisma.rewardRedemption.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.calculateTotalEarnedXp(context),
    ]);

    return {
      redemptions,
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.status, group._count._all]),
      ),
      totalEarnedXp,
    };
  }

  async findRedemption(params: {
    context: StudentAppContext;
    redemptionId: string;
  }): Promise<StudentRewardRedemptionDetailReadModel | null> {
    const redemption = await this.scopedPrisma.rewardRedemption.findFirst({
      where: {
        ...buildOwnRedemptionWhere(params.context),
        id: params.redemptionId,
      },
      ...STUDENT_REWARD_REDEMPTION_ARGS,
    });

    if (!redemption) return null;

    return {
      redemption,
      totalEarnedXp: await this.calculateTotalEarnedXp(params.context),
    };
  }

  private async calculateTotalEarnedXp(
    context: StudentAppContext,
  ): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        studentId: context.studentId,
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    return Math.max(0, result._sum.amount ?? 0);
  }
}

function buildVisibleRewardWhere(params: {
  context: StudentAppContext;
  type?: string;
}): Prisma.RewardCatalogItemWhereInput {
  return {
    status: RewardCatalogItemStatus.PUBLISHED,
    deletedAt: null,
    ...(params.type ? { type: normalizeRewardType(params.type) } : {}),
    OR: [{ academicYearId: null }, { academicYearId: params.context.academicYearId }],
    AND: [
      {
        OR: [
          { termId: null },
          ...(params.context.termId ? [{ termId: params.context.termId }] : []),
        ],
      },
      {
        OR: [{ isUnlimited: true }, { stockRemaining: { gt: 0 } }],
      },
    ],
  };
}

function buildOwnRedemptionWhere(
  context: StudentAppContext,
): Prisma.RewardRedemptionWhereInput {
  return {
    studentId: context.studentId,
    academicYearId: context.academicYearId,
    ...(context.termId ? { termId: context.termId } : {}),
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
