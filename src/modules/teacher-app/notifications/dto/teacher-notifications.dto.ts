import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  COMMUNICATION_NOTIFICATION_PRIORITIES,
  COMMUNICATION_NOTIFICATION_SOURCE_MODULES,
  COMMUNICATION_NOTIFICATION_STATUSES,
  COMMUNICATION_NOTIFICATION_TYPES,
} from '../../../communication/dto/communication-notification.dto';

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

export class TeacherNotificationsListResponseDto {
  notifications!: TeacherNotificationDto[];
  pagination!: TeacherNotificationsPaginationDto;
  summary!: TeacherNotificationsSummaryDto;
}

export class TeacherNotificationResponseDto {
  notification!: TeacherNotificationDto;
}

export class TeacherNotificationsReadAllResponseDto {
  markedCount!: number;
  readAt!: string;
}
