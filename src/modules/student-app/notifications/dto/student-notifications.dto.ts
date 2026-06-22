import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import {
  COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES,
  COMMUNICATION_APP_NOTIFICATION_CATEGORIES,
  COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES,
  COMMUNICATION_NOTIFICATION_PRIORITIES,
  COMMUNICATION_NOTIFICATION_SOURCE_MODULES,
  COMMUNICATION_NOTIFICATION_STATUSES,
  COMMUNICATION_NOTIFICATION_TYPES,
} from '../../../communication/dto/communication-notification.dto';
import { UpdateCommunicationNotificationPreferencesDto } from '../../../communication/dto/communication-notification-preference.dto';

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ListStudentNotificationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)
  priority?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_TYPES)
  type?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_SOURCE_MODULES)
  sourceModule?: string;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES)
  unreadOnly?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_APP_NOTIFICATION_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES)
  groupBy?: string;

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

export class StudentNotificationDeepLinkDto {
  type!: string;
  announcementId?: string;
  conversationId?: string;
  messageId?: string;
}

export class StudentNotificationDto {
  notificationId!: string;
  notification_id!: string;
  type!: string;
  sourceModule!: string;
  source_module!: string;
  sourceId!: string | null;
  source_id!: string | null;
  title!: string;
  body!: string | null;
  priority!: string;
  status!: string;
  readAt!: string | null;
  read_at!: string | null;
  archivedAt!: string | null;
  archived_at!: string | null;
  createdAt!: string;
  created_at!: string;
  deepLink!: StudentNotificationDeepLinkDto | null;
  deep_link!: StudentNotificationDeepLinkDto | null;
}

export class StudentNotificationsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentNotificationsSummaryDto {
  unreadCount!: number;
  unread_count!: number;
}

export class StudentNotificationGroupDto {
  key!: string;
  label!: string;
  count!: number;
  unreadCount!: number;
  unread_count!: number;
}

export class StudentNotificationsListResponseDto {
  notifications!: StudentNotificationDto[];
  pagination!: StudentNotificationsPaginationDto;
  summary!: StudentNotificationsSummaryDto;
  groups?: StudentNotificationGroupDto[];
}

export class StudentNotificationResponseDto {
  notification!: StudentNotificationDto;
}

export class StudentNotificationsReadAllResponseDto {
  markedCount!: number;
  marked_count!: number;
  readAt!: string;
  read_at!: string;
}

export class StudentNotificationPreferenceDto {
  category!: string;
  label!: string;
  description!: string;
  inAppEnabled!: boolean;
  in_app_enabled!: boolean;
  pushEnabled!: boolean;
  push_enabled!: boolean;
  canChange!: boolean;
  can_change!: boolean;
}

export class StudentNotificationPreferencesResponseDto {
  preferences!: StudentNotificationPreferenceDto[];
}

export class UpdateStudentNotificationPreferencesDto extends UpdateCommunicationNotificationPreferencesDto {}
