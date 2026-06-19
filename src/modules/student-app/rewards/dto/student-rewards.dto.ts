import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STUDENT_REWARD_TYPES = [
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

export class StudentRewardsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_REWARD_TYPES)
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

export class RedeemStudentRewardDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class StudentRewardImageDto {
  id!: string;
  originalName!: string | null;
  mimeType!: string | null;
  sizeBytes!: number | null;
  visibility!: string;
  createdAt!: string;
  downloadPath!: string;
}

export class StudentRewardSummaryDto {
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
  image!: StudentRewardImageDto | null;
}

export class StudentRewardsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentRewardsListResponseDto {
  rewards!: StudentRewardSummaryDto[];
  pagination!: StudentRewardsPaginationDto;
  xp!: {
    totalEarnedXp: number;
  };
}

export class StudentRewardResponseDto {
  reward!: StudentRewardSummaryDto;
  xp!: {
    totalEarnedXp: number;
  };
}

export class StudentRewardRedemptionDto {
  redemptionId!: string;
  reward!: StudentRewardSummaryDto;
  status!: string;
  requestSource!: string;
  requestedAt!: string;
  reviewedAt!: string | null;
  fulfilledAt!: string | null;
  cancelledAt!: string | null;
  note!: string | null;
  nextAction!: 'await_review' | 'await_fulfillment' | 'terminal';
}

export class StudentRewardRedemptionsResponseDto {
  redemptions!: StudentRewardRedemptionDto[];
  summary!: {
    total: number;
    requested: number;
    approved: number;
    rejected: number;
    fulfilled: number;
    cancelled: number;
  };
}

export class StudentRewardRedemptionResponseDto {
  redemption!: StudentRewardRedemptionDto;
}
