import { CommunicationNotificationType } from '@prisma/client';
import {
  DismissalNotificationChildDto,
  DismissalNotificationGateDto,
  DismissalNotificationItemDto,
  DismissalNotificationReadResponseDto,
  DismissalNotificationsListResponseDto,
  DismissalNotificationRequestDto,
  PublicDismissalNotificationRequestStatus,
  PublicDismissalNotificationType,
} from '../dto/dismissal-notifications-query.dto';
import {
  DismissalNotificationListResult,
  DismissalNotificationRecord,
} from '../infrastructure/dismissal-notifications.repository';

export function presentDismissalNotificationsList(
  result: DismissalNotificationListResult,
): DismissalNotificationsListResponseDto {
  return {
    data: result.items.map(presentDismissalNotification),
    summary: result.summary,
    pagination: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  };
}

export function presentDismissalNotificationRead(
  notification: DismissalNotificationRecord,
): DismissalNotificationReadResponseDto {
  return {
    notification: {
      id: notification.id,
      readAt: (notification.readAt ?? new Date()).toISOString(),
    },
  };
}

function presentDismissalNotification(
  notification: DismissalNotificationRecord,
): DismissalNotificationItemDto {
  const metadata = asRecord(notification.metadata);

  return {
    id: notification.id,
    type: presentNotificationType(notification.type),
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    request: readRequest(metadata?.request),
    child: readChild(metadata?.child),
    gate: readGate(metadata?.gate),
  };
}

function presentNotificationType(
  type: CommunicationNotificationType,
): PublicDismissalNotificationType {
  switch (type) {
    case CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED:
      return 'request_cancelled';
    case CommunicationNotificationType.DISMISSAL_REQUEST_CALLED:
      return 'request_called';
    case CommunicationNotificationType.DISMISSAL_REQUEST_READY:
      return 'request_ready';
    case CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER:
      return 'request_handed_over';
    case CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED:
      return 'request_expired';
    case CommunicationNotificationType.DISMISSAL_REQUEST_CREATED:
    default:
      return 'request_created';
  }
}

function readRequest(value: unknown): DismissalNotificationRequestDto | null {
  const record = asRecord(value);
  const id = readString(record?.id);
  const status = readRequestStatus(record?.status);
  if (!id || !status) return null;

  return { id, status };
}

function readChild(value: unknown): DismissalNotificationChildDto | null {
  const record = asRecord(value);
  const id = readString(record?.id);
  const displayName = readString(record?.displayName);
  if (!id || !displayName) return null;

  return {
    id,
    displayName,
    grade: readNullableString(record?.grade),
    section: readNullableString(record?.section),
    classroom: readNullableString(record?.classroom),
  };
}

function readGate(value: unknown): DismissalNotificationGateDto | null {
  const record = asRecord(value);
  const id = readString(record?.id);
  const code = readString(record?.code);
  const name = readString(record?.name);
  if (!id || !code || !name) return null;

  return { id, code, name };
}

function readRequestStatus(
  value: unknown,
): PublicDismissalNotificationRequestStatus | null {
  const status = readString(value);
  if (
    status === 'requested' ||
    status === 'queued' ||
    status === 'called' ||
    status === 'moving' ||
    status === 'at_gate' ||
    status === 'ready' ||
    status === 'handed_over' ||
    status === 'cancelled' ||
    status === 'expired'
  ) {
    return status;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return readString(value);
}
