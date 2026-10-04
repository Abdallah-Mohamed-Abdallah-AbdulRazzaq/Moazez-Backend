import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES } from '../../../communication/domain/communication-notification-preference-domain';

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ListParentNotificationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)
  @ApiPropertyOptional({ enum: COMMUNICATION_NOTIFICATION_STATUSES })
  status?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)
  @ApiPropertyOptional({ enum: COMMUNICATION_NOTIFICATION_PRIORITIES })
  priority?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_TYPES)
  @ApiPropertyOptional({ enum: COMMUNICATION_NOTIFICATION_TYPES })
  type?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_NOTIFICATION_SOURCE_MODULES)
  @ApiPropertyOptional({ enum: COMMUNICATION_NOTIFICATION_SOURCE_MODULES })
  sourceModule?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdTo?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES)
  @ApiPropertyOptional({ enum: COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES })
  unreadOnly?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(COMMUNICATION_APP_NOTIFICATION_CATEGORIES)
  @ApiPropertyOptional({ enum: COMMUNICATION_APP_NOTIFICATION_CATEGORIES })
  category?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES)
  @ApiPropertyOptional({ enum: COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES })
  groupBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100 })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10000 })
  page?: number;
}

export class ParentNotificationDeepLinkDto {
  @ApiProperty({
    enum: ['academic_content', 'announcement', 'conversation_message'],
  })
  type!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  announcementId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  conversationId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  messageId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Academic Content navigation identity; content authorization is checked separately.',
  })
  academicContentId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  publicationId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  studentId?: string | null;
}

export class ParentNotificationDto {
  @ApiProperty({ format: 'uuid' })
  notificationId!: string;
  @ApiProperty({ format: 'uuid' })
  notification_id!: string;
  @ApiProperty({ enum: COMMUNICATION_NOTIFICATION_TYPES })
  type!: string;
  @ApiProperty({ enum: COMMUNICATION_NOTIFICATION_SOURCE_MODULES })
  sourceModule!: string;
  @ApiProperty({ enum: COMMUNICATION_NOTIFICATION_SOURCE_MODULES })
  source_module!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  source_id!: string | null;
  @ApiProperty()
  title!: string;
  @ApiProperty({ type: String, nullable: true })
  body!: string | null;
  @ApiProperty({ enum: COMMUNICATION_NOTIFICATION_PRIORITIES })
  priority!: string;
  @ApiProperty({ enum: COMMUNICATION_NOTIFICATION_STATUSES })
  status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  read_at!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archived_at!: string | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  created_at!: string;
  @ApiProperty({ type: () => ParentNotificationDeepLinkDto, nullable: true })
  deepLink!: ParentNotificationDeepLinkDto | null;
  @ApiProperty({ type: () => ParentNotificationDeepLinkDto, nullable: true })
  deep_link!: ParentNotificationDeepLinkDto | null;
}

export class ParentNotificationsPaginationDto {
  @ApiProperty({ minimum: 1 })
  page!: number;
  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;
  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class ParentNotificationsSummaryDto {
  @ApiProperty({ minimum: 0 })
  unreadCount!: number;
  @ApiProperty({ minimum: 0 })
  unread_count!: number;
}

export class ParentNotificationGroupDto {
  @ApiProperty()
  key!: string;
  @ApiProperty()
  label!: string;
  @ApiProperty({ minimum: 0 })
  count!: number;
  @ApiProperty({ minimum: 0 })
  unreadCount!: number;
  @ApiProperty({ minimum: 0 })
  unread_count!: number;
}

export class ParentNotificationsListResponseDto {
  @ApiProperty({ type: () => ParentNotificationDto, isArray: true })
  notifications!: ParentNotificationDto[];
  @ApiProperty({ type: () => ParentNotificationsPaginationDto })
  pagination!: ParentNotificationsPaginationDto;
  @ApiProperty({ type: () => ParentNotificationsSummaryDto })
  summary!: ParentNotificationsSummaryDto;
  @ApiPropertyOptional({
    type: () => ParentNotificationGroupDto,
    isArray: true,
  })
  groups?: ParentNotificationGroupDto[];
}

export class ParentNotificationResponseDto {
  @ApiProperty({ type: () => ParentNotificationDto })
  notification!: ParentNotificationDto;
}

export class ParentNotificationsReadAllResponseDto {
  @ApiProperty({ minimum: 0 })
  markedCount!: number;
  @ApiProperty({ minimum: 0 })
  marked_count!: number;
  @ApiProperty({ format: 'date-time' })
  readAt!: string;
  @ApiProperty({ format: 'date-time' })
  read_at!: string;
}

export class ParentNotificationPreferenceDto {
  @ApiProperty({ enum: COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES })
  category!: string;
  @ApiProperty()
  label!: string;
  @ApiProperty()
  description!: string;
  @ApiProperty()
  inAppEnabled!: boolean;
  @ApiProperty()
  in_app_enabled!: boolean;
  @ApiProperty()
  pushEnabled!: boolean;
  @ApiProperty()
  push_enabled!: boolean;
  @ApiProperty()
  canChange!: boolean;
  @ApiProperty()
  can_change!: boolean;
}

export class ParentNotificationPreferencesResponseDto {
  @ApiProperty({ type: () => ParentNotificationPreferenceDto, isArray: true })
  preferences!: ParentNotificationPreferenceDto[];
}

export class UpdateParentNotificationPreferencesDto extends UpdateCommunicationNotificationPreferencesDto {}
