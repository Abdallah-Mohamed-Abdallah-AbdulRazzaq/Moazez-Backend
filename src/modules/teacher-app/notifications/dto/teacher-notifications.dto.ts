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

export class ListTeacherNotificationsQueryDto {
  @IsOptional()
  @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_NOTIFICATION_TYPES)
  type?: string;

  @IsOptional()
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

export class TeacherNotificationDeepLinkDto {
  type!: string;
  announcementId?: string;
  conversationId?: string;
  messageId?: string;
}

export class TeacherNotificationDto {
  notificationId!: string;
  type!: string;
  sourceModule!: string;
  sourceId!: string | null;
  title!: string;
  body!: string | null;
  priority!: string;
  status!: string;
  readAt!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
  deepLink!: TeacherNotificationDeepLinkDto | null;
}

export class TeacherNotificationsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherNotificationsSummaryDto {
  unreadCount!: number;
}

export class TeacherNotificationGroupDto {
  key!: string;
  label!: string;
  count!: number;
  unreadCount!: number;
}

export class TeacherNotificationsListResponseDto {
  notifications!: TeacherNotificationDto[];
  pagination!: TeacherNotificationsPaginationDto;
  summary!: TeacherNotificationsSummaryDto;
  groups?: TeacherNotificationGroupDto[];
}

export class TeacherNotificationResponseDto {
  notification!: TeacherNotificationDto;
}

export class TeacherNotificationsReadAllResponseDto {
  markedCount!: number;
  readAt!: string;
}

export class TeacherNotificationPreferenceDto {
  category!: string;
  label!: string;
  description!: string;
  inAppEnabled!: boolean;
  pushEnabled!: boolean;
  canChange!: boolean;
}

export class TeacherNotificationPreferencesResponseDto {
  preferences!: TeacherNotificationPreferenceDto[];
}

export class UpdateTeacherNotificationPreferencesDto extends UpdateCommunicationNotificationPreferencesDto {}
