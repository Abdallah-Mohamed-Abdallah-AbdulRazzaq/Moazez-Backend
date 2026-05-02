import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STUDENT_DIRECT_MODES = [
  'disabled',
  'same_classroom',
  'same_grade',
  'same_school',
  'any_school_user',
  'approval_required',
] as const;

const MODERATION_MODES = ['standard', 'strict', 'relaxed'] as const;

export class UpdateCommunicationPolicyDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDirectStaffToStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAdminToAnyone?: boolean;

  @IsOptional()
  @IsBoolean()
  allowTeacherToParent?: boolean;

  @IsOptional()
  @IsBoolean()
  allowTeacherToStudent?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentToTeacher?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentToStudent?: boolean;

  @IsOptional()
  @IsIn(STUDENT_DIRECT_MODES)
  studentDirectMode?: string;

  @IsOptional()
  @IsBoolean()
  allowTeacherCreatedGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStudentCreatedGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApprovalForStudentGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  allowParentToParent?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAttachments?: boolean;

  @IsOptional()
  @IsBoolean()
  allowVoiceMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  allowVideoMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMessageEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMessageDelete?: boolean;

  @IsOptional()
  @IsBoolean()
  allowReactions?: boolean;

  @IsOptional()
  @IsBoolean()
  allowReadReceipts?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDeliveryReceipts?: boolean;

  @IsOptional()
  @IsBoolean()
  allowOnlinePresence?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(5000)
  maxGroupMembers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  maxMessageLength?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttachmentSizeMb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @IsOptional()
  @IsIn(MODERATION_MODES)
  moderationMode?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class DisableCommunicationPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
