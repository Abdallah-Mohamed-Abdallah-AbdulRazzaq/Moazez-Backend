import {
  CommunicationNotificationType,
  DismissalRequestStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';

export type DismissalRealtimeRequestReason =
  | 'request_created'
  | 'request_cancelled'
  | 'status_changed'
  | 'arrival_confirmed'
  | 'delivered';

export interface DismissalRealtimeRequestRecord {
  id: string;
  status: DismissalRequestStatus;
  requestedById: string;
  student: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
  enrollment: {
    classroomId: string | null;
    classroom: {
      id: string;
      nameAr: string | null;
      nameEn: string | null;
      sectionId: string | null;
      section: {
        id: string;
        nameAr: string | null;
        nameEn: string | null;
        gradeId: string | null;
        grade: {
          id: string;
          nameAr: string | null;
          nameEn: string | null;
          stageId: string | null;
          stage: {
            id: string;
            nameAr: string | null;
            nameEn: string | null;
          } | null;
        } | null;
      } | null;
    } | null;
  };
  gate: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface DismissalRealtimeNotificationRecord {
  id: string;
  type: CommunicationNotificationType;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

export function presentDismissalRealtimeRequestEvent(params: {
  request: DismissalRealtimeRequestRecord;
  type: DismissalRealtimeRequestReason;
  previousStatus?: DismissalRequestStatus | null;
  occurredAt: Date;
}): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    type: params.type,
    occurredAt: params.occurredAt.toISOString(),
    request: {
      id: params.request.id,
      status: presentRealtimeRequestStatus(params.request.status),
      previousStatus: params.previousStatus
        ? presentRealtimeRequestStatus(params.previousStatus)
        : null,
    },
    child: {
      id: params.request.student.id,
      displayName: displayName([
        params.request.student.firstName,
        params.request.student.lastName,
      ]),
      grade: label(params.request.enrollment.classroom?.section?.grade ?? null),
      section: label(params.request.enrollment.classroom?.section ?? null),
      classroom: label(params.request.enrollment.classroom ?? null),
    },
    gate: params.request.gate
      ? {
          id: params.request.gate.id,
          code: params.request.gate.code,
          name: params.request.gate.name,
        }
      : null,
  };
}

export function presentDismissalRealtimeQueueChanged(params: {
  request: DismissalRealtimeRequestRecord;
  reason: DismissalRealtimeRequestReason;
  occurredAt: Date;
}): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    occurredAt: params.occurredAt.toISOString(),
    reason: params.reason,
    request: {
      id: params.request.id,
      status: presentRealtimeRequestStatus(params.request.status),
    },
  };
}

export function presentParentSmartPickupRealtimeChanged(params: {
  request: DismissalRealtimeRequestRecord;
  allowParentCancelBeforeCalled: boolean;
  occurredAt: Date;
}): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    occurredAt: params.occurredAt.toISOString(),
    request: {
      id: params.request.id,
      status: presentRealtimeRequestStatus(params.request.status),
      canCancel:
        params.allowParentCancelBeforeCalled &&
        (params.request.status === DismissalRequestStatus.REQUESTED ||
          params.request.status === DismissalRequestStatus.QUEUED),
    },
    child: {
      id: params.request.student.id,
      displayName: displayName([
        params.request.student.firstName,
        params.request.student.lastName,
      ]),
    },
  };
}

export function presentDismissalRealtimeNotification(params: {
  notification: DismissalRealtimeNotificationRecord;
  occurredAt?: Date;
}): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    occurredAt: (
      params.occurredAt ?? params.notification.createdAt
    ).toISOString(),
    notification: {
      id: params.notification.id,
      type: params.notification.type.toLowerCase(),
      title: params.notification.title,
      body: params.notification.body,
      readAt: params.notification.readAt
        ? params.notification.readAt.toISOString()
        : null,
    },
  };
}

export function presentDismissalRealtimeNotificationsReadAll(params: {
  updatedCount: number;
  occurredAt: Date;
}): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    occurredAt: params.occurredAt.toISOString(),
    updatedCount: params.updatedCount,
  };
}

function presentRealtimeRequestStatus(status: DismissalRequestStatus): string {
  return status.toLowerCase();
}

function displayName(parts: Array<string | null | undefined>): string {
  const value = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return value || 'Student';
}

function label(
  record: { nameEn?: string | null; nameAr?: string | null } | null,
): string | null {
  return record?.nameEn || record?.nameAr || null;
}
