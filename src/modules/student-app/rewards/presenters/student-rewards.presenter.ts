import { RewardRedemptionStatus } from '@prisma/client';
import {
  StudentRewardRedemptionDto,
  StudentRewardRedemptionResponseDto,
  StudentRewardRedemptionsResponseDto,
  StudentRewardResponseDto,
  StudentRewardsListResponseDto,
  StudentRewardSummaryDto,
} from '../dto/student-rewards.dto';
import type {
  StudentRewardCatalogReadModel,
  StudentRewardDetailReadModel,
  StudentRewardRedemptionDetailReadModel,
  StudentRewardRedemptionReadModel,
  StudentRewardRedemptionsReadModel,
  StudentRewardsListReadModel,
} from '../infrastructure/student-rewards-read.adapter';

export class StudentRewardsPresenter {
  static presentRewardsList(
    result: StudentRewardsListReadModel,
  ): StudentRewardsListResponseDto {
    return {
      rewards: result.rewards.map((reward) =>
        presentRewardSummary(reward, result.totalEarnedXp),
      ),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      xp: {
        totalEarnedXp: result.totalEarnedXp,
      },
    };
  }

  static presentRewardDetail(
    result: StudentRewardDetailReadModel,
  ): StudentRewardResponseDto {
    return {
      reward: presentRewardSummary(result.reward, result.totalEarnedXp),
      xp: {
        totalEarnedXp: result.totalEarnedXp,
      },
    };
  }

  static presentRedemptions(
    result: StudentRewardRedemptionsReadModel,
  ): StudentRewardRedemptionsResponseDto {
    return {
      redemptions: result.redemptions.map((redemption) =>
        presentRedemption(redemption, result.totalEarnedXp),
      ),
      summary: presentRedemptionSummary(result),
    };
  }

  static presentRedemption(
    result: StudentRewardRedemptionDetailReadModel,
  ): StudentRewardRedemptionResponseDto {
    return {
      redemption: presentRedemption(result.redemption, result.totalEarnedXp),
    };
  }
}

function presentRewardSummary(
  reward: StudentRewardCatalogReadModel,
  totalEarnedXp: number,
): StudentRewardSummaryDto {
  const requiredXp = reward.minTotalXp ?? null;
  const insufficientXp = requiredXp !== null && totalEarnedXp < requiredXp;

  return {
    rewardId: reward.id,
    title: reward.titleEn ?? reward.titleAr ?? null,
    description: reward.descriptionEn ?? reward.descriptionAr ?? null,
    type: presentEnum(reward.type),
    displayType: presentEnum(reward.type),
    minTotalXp: requiredXp,
    requiredXp,
    isRedeemable: !insufficientXp,
    insufficientXp,
    isUnlimited: reward.isUnlimited,
    stockRemaining: reward.stockRemaining ?? null,
    availabilityStatus: insufficientXp ? 'insufficient_xp' : 'available',
    image: reward.imageFile ? presentRewardImage(reward.imageFile) : null,
  };
}

function presentRedemption(
  redemption: StudentRewardRedemptionReadModel,
  totalEarnedXp: number,
): StudentRewardRedemptionDto {
  return {
    redemptionId: redemption.id,
    reward: presentRewardSummary(redemption.catalogItem, totalEarnedXp),
    status: presentEnum(redemption.status),
    requestSource: presentEnum(redemption.requestSource),
    requestedAt: redemption.requestedAt.toISOString(),
    reviewedAt: presentNullableDate(redemption.reviewedAt),
    fulfilledAt: presentNullableDate(redemption.fulfilledAt),
    cancelledAt: presentNullableDate(redemption.cancelledAt),
    note: redemption.requestNoteEn ?? redemption.requestNoteAr ?? null,
    nextAction: presentNextAction(redemption.status),
  };
}

function presentRewardImage(
  file: NonNullable<StudentRewardCatalogReadModel['imageFile']>,
) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    visibility: presentEnum(file.visibility),
    createdAt: file.createdAt.toISOString(),
    downloadPath: `/api/v1/files/${file.id}/download`,
  };
}

function presentRedemptionSummary(result: StudentRewardRedemptionsReadModel) {
  const counts = result.statusCounts;
  return {
    total: result.redemptions.length,
    requested: counts[RewardRedemptionStatus.REQUESTED] ?? 0,
    approved: counts[RewardRedemptionStatus.APPROVED] ?? 0,
    rejected: counts[RewardRedemptionStatus.REJECTED] ?? 0,
    fulfilled: counts[RewardRedemptionStatus.FULFILLED] ?? 0,
    cancelled: counts[RewardRedemptionStatus.CANCELLED] ?? 0,
  };
}

function presentNextAction(
  status: RewardRedemptionStatus,
): 'await_review' | 'await_fulfillment' | 'terminal' {
  switch (status) {
    case RewardRedemptionStatus.REQUESTED:
      return 'await_review';
    case RewardRedemptionStatus.APPROVED:
      return 'await_fulfillment';
    case RewardRedemptionStatus.REJECTED:
    case RewardRedemptionStatus.FULFILLED:
    case RewardRedemptionStatus.CANCELLED:
      return 'terminal';
  }
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
