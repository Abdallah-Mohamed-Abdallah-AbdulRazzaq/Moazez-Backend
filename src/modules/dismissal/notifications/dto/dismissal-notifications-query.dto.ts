import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListDismissalNotificationsQueryDto {
  @IsOptional()
  unreadOnly?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  sort?: string;
}

export type PublicDismissalNotificationType =
  | 'request_created'
  | 'request_cancelled'
  | 'request_called'
  | 'request_ready'
  | 'request_handed_over'
  | 'request_expired';

export type PublicDismissalNotificationRequestStatus =
  | 'requested'
  | 'queued'
  | 'called'
  | 'moving'
  | 'at_gate'
  | 'ready'
  | 'handed_over'
  | 'cancelled'
  | 'expired';

export class DismissalNotificationRequestDto {
  id!: string;
  status!: PublicDismissalNotificationRequestStatus;
}

export class DismissalNotificationChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
}

export class DismissalNotificationGateDto {
  id!: string;
  code!: string;
  name!: string;
}

export class DismissalNotificationItemDto {
  id!: string;
  type!: PublicDismissalNotificationType;
  title!: string;
  body!: string;
  createdAt!: string;
  readAt!: string | null;
  request!: DismissalNotificationRequestDto | null;
  child!: DismissalNotificationChildDto | null;
  gate!: DismissalNotificationGateDto | null;
}

export class DismissalNotificationsSummaryDto {
  totalCount!: number;
  unreadCount!: number;
  requestCreatedCount!: number;
  requestCancelledCount!: number;
  requestCalledCount!: number;
  requestReadyCount!: number;
  requestHandedOverCount!: number;
  requestExpiredCount!: number;
}

export class DismissalNotificationsPaginationDto {
  page!: number;
  limit!: number;
  totalPages!: number;
}

export class DismissalNotificationsListResponseDto {
  data!: DismissalNotificationItemDto[];
  summary!: DismissalNotificationsSummaryDto;
  pagination!: DismissalNotificationsPaginationDto;
}

export class DismissalNotificationReadResponseDto {
  notification!: {
    id: string;
    readAt: string;
  };
}

export class DismissalNotificationsReadAllResponseDto {
  updatedCount!: number;
}
