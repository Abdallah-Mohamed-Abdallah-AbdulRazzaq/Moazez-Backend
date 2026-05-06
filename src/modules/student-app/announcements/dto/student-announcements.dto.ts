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

export const STUDENT_ANNOUNCEMENT_STATUSES = ['published'] as const;

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentAnnouncementsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_ANNOUNCEMENT_STATUSES)
  status?: 'published';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

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

export class StudentAnnouncementAttachmentDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  size!: string;
}

export class StudentAnnouncementCardDto {
  id!: string;
  announcementId!: string;
  announcement_id!: string;
  title!: string;
  description!: string;
  body!: string;
  sender!: string | null;
  dateLabel!: string;
  date_label!: string;
  category!: string | null;
  priority!: string;
  isPinned!: boolean;
  is_pinned!: boolean;
  isNew!: boolean;
  is_new!: boolean;
  actionLabel!: string | null;
  action_label!: string | null;
  image!: null;
  publishedAt!: string | null;
  published_at!: string | null;
  expiresAt!: string | null;
  expires_at!: string | null;
  readAt!: string | null;
  read_at!: string | null;
  attachmentsCount!: number;
  attachments_count!: number;
}

export class StudentAnnouncementDetailDto extends StudentAnnouncementCardDto {}

export class StudentAnnouncementPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentAnnouncementsListResponseDto {
  announcements!: StudentAnnouncementCardDto[];
  pagination!: StudentAnnouncementPaginationDto;
}

export class StudentAnnouncementResponseDto {
  announcement!: StudentAnnouncementDetailDto;
}

export class StudentAnnouncementReadResponseDto {
  announcementId!: string;
  announcement_id!: string;
  readAt!: string;
  read_at!: string;
}

export class StudentAnnouncementAttachmentsResponseDto {
  announcementId!: string;
  announcement_id!: string;
  attachments!: StudentAnnouncementAttachmentDto[];
}
