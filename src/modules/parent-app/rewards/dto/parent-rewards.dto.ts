import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const PARENT_REWARD_TYPES = [
  'physical',
  'digital',
  'privilege',
  'certificate',
  'other',
] as const;

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ParentRewardsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_REWARD_TYPES)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ParentRewardsChildDto {
  studentId!: string;
  student_id!: string;
}

export class ParentRewardImageDto {
  id!: string;
  originalName!: string | null;
  mimeType!: string | null;
  sizeBytes!: number | null;
  visibility!: string;
  createdAt!: string;
  downloadPath!: string;
}

export class ParentRewardSummaryDto {
  rewardId!: string;
  title!: string | null;
  description!: string | null;
  type!: string;
  displayType!: string;
  minTotalXp!: number | null;
  requiredXp!: number | null;
  isRedeemable!: boolean;
  insufficientXp!: boolean;
  isUnlimited!: boolean;
  stockRemaining!: number | null;
  availabilityStatus!: 'available' | 'insufficient_xp';
  image!: ParentRewardImageDto | null;
}

export class ParentRewardsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class ParentRewardsListResponseDto {
  child!: ParentRewardsChildDto;
  rewards!: ParentRewardSummaryDto[];
  pagination!: ParentRewardsPaginationDto;
  xp!: {
    totalEarnedXp: number;
  };
}

export class ParentRewardResponseDto {
  child!: ParentRewardsChildDto;
  reward!: ParentRewardSummaryDto;
  xp!: {
    totalEarnedXp: number;
  };
}

export class ParentRewardRedemptionDto {
  redemptionId!: string;
  reward!: ParentRewardSummaryDto;
  status!: string;
  requestSource!: string;
  requestedAt!: string;
  reviewedAt!: string | null;
  fulfilledAt!: string | null;
  cancelledAt!: string | null;
  note!: string | null;
  nextAction!: 'await_review' | 'await_fulfillment' | 'terminal';
}

export class ParentRewardRedemptionsResponseDto {
  child!: ParentRewardsChildDto;
  redemptions!: ParentRewardRedemptionDto[];
  summary!: {
    total: number;
    requested: number;
    approved: number;
    rejected: number;
    fulfilled: number;
    cancelled: number;
  };
}

export class ParentRewardRedemptionResponseDto {
  child!: ParentRewardsChildDto;
  redemption!: ParentRewardRedemptionDto;
}
