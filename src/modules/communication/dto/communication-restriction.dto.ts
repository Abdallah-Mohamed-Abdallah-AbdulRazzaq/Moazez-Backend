import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COMMUNICATION_RESTRICTION_STATUSES,
  COMMUNICATION_RESTRICTION_TYPES,
} from '../domain/communication-restriction-domain';

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ListCommunicationUserRestrictionsQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_RESTRICTION_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_RESTRICTION_TYPES)
  type?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;
}

export class CreateCommunicationUserRestrictionDto {
  @IsUUID()
  targetUserId!: string;

  @IsIn(COMMUNICATION_RESTRICTION_TYPES)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateCommunicationUserRestrictionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
