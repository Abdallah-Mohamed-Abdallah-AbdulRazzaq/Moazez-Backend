import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const COMMUNICATION_PARTICIPANT_ROLES = [
  'owner',
  'admin',
  'moderator',
  'member',
  'read_only',
  'system',
] as const;

export const COMMUNICATION_PARTICIPANT_STATUSES = [
  'active',
  'invited',
  'left',
  'removed',
  'muted',
  'blocked',
] as const;

export class AddCommunicationParticipantDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsIn(COMMUNICATION_PARTICIPANT_ROLES)
  role?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_PARTICIPANT_STATUSES)
  status?: string;

  @IsOptional()
  @IsISO8601()
  mutedUntil?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateCommunicationParticipantDto {
  @IsOptional()
  @IsIn(COMMUNICATION_PARTICIPANT_ROLES)
  role?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_PARTICIPANT_STATUSES)
  status?: string;

  @IsOptional()
  @IsISO8601()
  mutedUntil?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class PromoteCommunicationParticipantDto {
  @IsOptional()
  @IsIn(COMMUNICATION_PARTICIPANT_ROLES)
  targetRole?: string;
}

export class DemoteCommunicationParticipantDto {
  @IsOptional()
  @IsIn(COMMUNICATION_PARTICIPANT_ROLES)
  targetRole?: string;
}

export class CreateCommunicationInviteDto {
  @IsUUID()
  invitedUserId!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class RejectCommunicationInviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class CreateCommunicationJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ApproveCommunicationJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class RejectCommunicationJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
