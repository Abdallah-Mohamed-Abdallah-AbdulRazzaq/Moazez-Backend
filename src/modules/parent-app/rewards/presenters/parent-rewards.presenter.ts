import { RewardRedemptionStatus } from '@prisma/client';
import {
  ParentRewardRedemptionDto,
  ParentRewardRedemptionResponseDto,
  ParentRewardRedemptionsResponseDto,
  ParentRewardResponseDto,
  ParentRewardSummaryDto,
  ParentRewardsChildDto,
  ParentRewardsListResponseDto,
} from '../dto/parent-rewards.dto';
import type {
  ParentRewardCatalogReadModel,
  ParentRewardDetailReadModel,
  ParentRewardRedemptionDetailReadModel,
  ParentRewardRedemptionReadModel,
  ParentRewardRedemptionsReadModel,
  ParentRewardsListReadModel,
} from '../infrastructure/parent-rewards-read.adapter';

export class ParentRewardsPresenter {
  static presentRewardsList(
    result: ParentRewardsListReadModel,
  ): ParentRewardsListResponseDto {
    return {
      child: presentChild(result.child),
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
    result: ParentRewardDetailReadModel,
  ): ParentRewardResponseDto {
    return {
      child: presentChild(result.child),
      reward: presentRewardSummary(result.reward, result.totalEarnedXp),
      xp: {
        totalEarnedXp: result.totalEarnedXp,
      },
    };
  }

  static presentRedemptions(
    result: ParentRewardRedemptionsReadModel,
  ): ParentRewardRedemptionsResponseDto {
    return {
      child: presentChild(result.child),
      redemptions: result.redemptions.map((redemption) =>
        presentRedemption(redemption, result.totalEarnedXp),
      ),
      summary: presentRedemptionSummary(result),
    };
  }

  static presentRedemption(
    result: ParentRewardRedemptionDetailReadModel,
  ): ParentRewardRedemptionResponseDto {
    return {
      child: presentChild(result.child),
      redemption: presentRedemption(result.redemption, result.totalEarnedXp),
    };
  }
}

function presentChild(child: { studentId: string }): ParentRewardsChildDto {
  return {
    studentId: child.studentId,
    student_id: child.studentId,
  };
}

function presentRewardSummary(
  reward: ParentRewardCatalogReadModel,
  totalEarnedXp: number,
): ParentRewardSummaryDto {
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
  redemption: ParentRewardRedemptionReadModel,
  totalEarnedXp: number,
): ParentRewardRedemptionDto {
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
  file: NonNullable<ParentRewardCatalogReadModel['imageFile']>,
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

function presentRedemptionSummary(result: ParentRewardRedemptionsReadModel) {
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
