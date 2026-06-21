import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  TEACHER_ANNOUNCEMENT_AUDIENCES,
  TEACHER_ANNOUNCEMENT_PRIORITIES,
  TEACHER_ANNOUNCEMENT_TARGET_TYPES,
} from '../domain/teacher-announcement-app-domain';

export const TEACHER_ANNOUNCEMENT_STATUSES = [
  'draft',
  'scheduled',
  'published',
  'archived',
  'cancelled',
] as const;

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class TeacherAnnouncementParamsDto {
  @IsUUID()
  announcementId!: string;
}

export class TeacherAnnouncementTargetDto {
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_ANNOUNCEMENT_TARGET_TYPES)
  type!: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;
}

export class ListTeacherAnnouncementsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_ANNOUNCEMENT_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

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

export class CreateTeacherAnnouncementDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @ValidateNested()
  @Type(() => TeacherAnnouncementTargetDto)
  target!: TeacherAnnouncementTargetDto;

  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_ANNOUNCEMENT_AUDIENCES)
  audience!: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_ANNOUNCEMENT_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}

export class UpdateTeacherAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TeacherAnnouncementTargetDto)
  target?: TeacherAnnouncementTargetDto;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_ANNOUNCEMENT_AUDIENCES)
  audience?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_ANNOUNCEMENT_PRIORITIES)
  priority?: string;
}

export class TeacherAnnouncementTargetResponseDto {
  type!: string;
  classId!: string;
  classroomId!: string;
  label!: string;
}

export class TeacherAnnouncementDto {
  announcementId!: string;
  title!: string;
  body!: string;
  status!: string;
  audience!: string;
  target!: TeacherAnnouncementTargetResponseDto;
  priority!: string;
  createdAt!: string;
  publishedAt!: string | null;
  archivedAt!: string | null;
  updatedAt!: string;
  attachmentsCount!: number;
  readCount!: number;
  canEdit!: boolean;
  canPublish!: boolean;
  canArchive!: boolean;
}

export class TeacherAnnouncementsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherAnnouncementsListResponseDto {
  announcements!: TeacherAnnouncementDto[];
  pagination!: TeacherAnnouncementsPaginationDto;
}

export class TeacherAnnouncementResponseDto {
  announcement!: TeacherAnnouncementDto;
}
