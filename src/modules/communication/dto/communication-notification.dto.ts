import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const COMMUNICATION_NOTIFICATION_STATUSES = [
  'unread',
  'read',
  'archived',
] as const;

export const COMMUNICATION_NOTIFICATION_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export const COMMUNICATION_NOTIFICATION_SOURCE_MODULES = [
  'communication',
  'announcements',
  'attendance',
  'grades',
  'behavior',
  'reinforcement',
  'admissions',
  'students',
  'system',
] as const;

export const COMMUNICATION_NOTIFICATION_TYPES = [
  'announcement_published',
  'message_received',
  'message_mention',
  'attendance_absence',
  'attendance_late',
  'grade_posted',
  'behavior_record_created',
  'reinforcement_reward_granted',
  'system_alert',
] as const;

export const COMMUNICATION_NOTIFICATION_DELIVERY_CHANNELS = [
  'in_app',
  'email',
  'sms',
  'push',
] as const;

export const COMMUNICATION_NOTIFICATION_DELIVERY_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'failed',
  'skipped',
] as const;

export class ListCommunicationNotificationsQueryDto {
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
  @IsString()
  @MaxLength(100)
  sourceType?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

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

export class ListCommunicationNotificationDeliveriesQueryDto {
  @IsOptional()
  @IsUUID()
  notificationId?: string;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_NOTIFICATION_DELIVERY_CHANNELS)
  channel?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_NOTIFICATION_DELIVERY_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_NOTIFICATION_DELIVERY_STATUSES)
  deliveryStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

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
