import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const COMMUNICATION_ANNOUNCEMENT_STATUSES = [
  'draft',
  'scheduled',
  'published',
  'archived',
  'cancelled',
] as const;

export const COMMUNICATION_ANNOUNCEMENT_CREATE_STATUSES = [
  'draft',
  'scheduled',
] as const;

export const COMMUNICATION_ANNOUNCEMENT_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export const COMMUNICATION_ANNOUNCEMENT_AUDIENCE_TYPES = [
  'school',
  'stage',
  'grade',
  'section',
  'classroom',
  'custom',
] as const;

export class CommunicationAnnouncementAudienceRowDto {
  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_AUDIENCE_TYPES)
  audienceType?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;
}

export class ListCommunicationAnnouncementsQueryDto {
  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_AUDIENCE_TYPES)
  audienceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsISO8601()
  publishedFrom?: string;

  @IsOptional()
  @IsISO8601()
  publishedTo?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

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

export class CreateCommunicationAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_CREATE_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_AUDIENCE_TYPES)
  audienceType?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CommunicationAnnouncementAudienceRowDto)
  audiences?: CommunicationAnnouncementAudienceRowDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateCommunicationAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_ANNOUNCEMENT_AUDIENCE_TYPES)
  audienceType?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CommunicationAnnouncementAudienceRowDto)
  audiences?: CommunicationAnnouncementAudienceRowDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class LinkCommunicationAnnouncementAttachmentDto {
  @IsUUID()
  fileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}
