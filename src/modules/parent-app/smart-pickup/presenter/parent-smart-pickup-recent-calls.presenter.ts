import { DismissalRequestEventType, DismissalRequestStatus } from '@prisma/client';
import { presentGateStatus } from '../../../dismissal/shared/dismissal.types';
import {
  CancelParentSmartPickupRequestResponseDto,
} from '../dto/cancel-parent-smart-pickup-request.dto';
import {
  ParentSmartPickupRecentCallDto,
  ParentSmartPickupRecentCallsResponseDto,
  ParentSmartPickupRecentCallsSummaryDto,
  ParentSmartPickupRecentCallTimelineEventDto,
  ParentSmartPickupRecentStatus,
} from '../dto/parent-smart-pickup-recent-calls.dto';
import type {
  ParentSmartPickupRecentCallRecord,
  ParentSmartPickupRecentCallSettingsRecord,
} from '../infrastructure/parent-smart-pickup-recent-calls.repository';

export class ParentSmartPickupRecentCallsPresenter {
  static presentList(params: {
    requests: ParentSmartPickupRecentCallRecord[];
    pageRequests: ParentSmartPickupRecentCallRecord[];
    settings: ParentSmartPickupRecentCallSettingsRecord | null;
    page: number;
    limit: number;
  }): ParentSmartPickupRecentCallsResponseDto {
    const summary = summarizeRequests(params.requests, params.settings);

    return {
      data: params.pageRequests.map((request) =>
        presentRequest(request, params.settings),
      ),
      summary,
      pagination: {
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(
          1,
          Math.ceil(params.requests.length / params.limit),
        ),
      },
    };
  }

  static presentCancel(params: {
    request: ParentSmartPickupRecentCallRecord;
    settings: ParentSmartPickupRecentCallSettingsRecord | null;
    previousStatus: DismissalRequestStatus | null;
    changed: boolean;
  }): CancelParentSmartPickupRequestResponseDto {
    const item = presentRequest(params.request, params.settings);

    return {
      request: {
        id: item.id,
        status: 'cancelled',
        previousStatus: params.previousStatus
          ? presentRequestStatus(params.previousStatus) as 'requested' | 'queued' | 'cancelled'
          : null,
        changed: params.changed,
        isActive: false,
        isTerminal: true,
        canCancel: false,
        canTrack: false,
        cancelledAt: item.cancelledAt,
        requestedAt: item.requestedAt,
        updatedAt: item.updatedAt,
        child: item.child,
        gate: item.gate,
        pickup: item.pickup,
        timeline: item.timeline,
      },
    };
  }
}

function presentRequest(
  request: ParentSmartPickupRecentCallRecord,
  settings: ParentSmartPickupRecentCallSettingsRecord | null,
): ParentSmartPickupRecentCallDto {
  const classroom = request.enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;
  const isActive = isActiveStatus(request.status);
  const isTerminal = isTerminalStatus(request.status);

  return {
    id: request.id,
    status: presentRequestStatus(request.status),
    isActive,
    isTerminal,
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    canCancel: canCancelRequest(request, settings),
    canTrack: isActive,
    calledAt: statusChangedAt(request, DismissalRequestStatus.CALLED),
    readyAt: statusChangedAt(request, DismissalRequestStatus.READY),
    handedOverAt:
      request.handedOverAt?.toISOString() ??
      statusChangedAt(request, DismissalRequestStatus.HANDED_OVER),
    cancelledAt: statusChangedAt(request, DismissalRequestStatus.CANCELLED),
    expiredAt: statusChangedAt(request, DismissalRequestStatus.EXPIRED),
    child: {
      id: request.student.id,
      displayName:
        displayName([request.student.firstName, request.student.lastName]) ??
        'Student',
      grade: label(grade),
      section: label(section),
      classroom: label(classroom),
    },
    gate: {
      id: request.gate.id,
      code: request.gate.code,
      name: request.gate.name,
      status: presentGateStatus(request.gate.status),
    },
    pickup: {
      codeRequired: settings?.requirePickupCode ?? true,
      codeIssued: Boolean(request.pickupCodeIssuedAt),
      codeIssuedAt: request.pickupCodeIssuedAt?.toISOString() ?? null,
    },
    timeline: request.events.map(presentTimelineEvent),
  };
}

function canCancelRequest(
  request: ParentSmartPickupRecentCallRecord,
  settings: ParentSmartPickupRecentCallSettingsRecord | null,
): boolean {
  return (
    settings?.allowParentCancelBeforeCalled === true &&
    (request.status === DismissalRequestStatus.REQUESTED ||
      request.status === DismissalRequestStatus.QUEUED)
  );
}

function summarizeRequests(
  requests: ParentSmartPickupRecentCallRecord[],
  settings: ParentSmartPickupRecentCallSettingsRecord | null,
): ParentSmartPickupRecentCallsSummaryDto {
  const summary: ParentSmartPickupRecentCallsSummaryDto = {
    totalCount: requests.length,
    activeCount: 0,
    requestedCount: 0,
    queuedCount: 0,
    calledCount: 0,
    movingCount: 0,
    atGateCount: 0,
    readyCount: 0,
    handedOverCount: 0,
    cancelledCount: 0,
    expiredCount: 0,
    cancellableCount: 0,
    terminalCount: 0,
    canCancelCount: 0,
  };

  for (const request of requests) {
    if (isActiveStatus(request.status)) summary.activeCount += 1;
    if (isTerminalStatus(request.status)) summary.terminalCount += 1;
    if (canCancelRequest(request, settings)) {
      summary.cancellableCount += 1;
      summary.canCancelCount += 1;
    }

    switch (request.status) {
      case DismissalRequestStatus.REQUESTED:
        summary.requestedCount += 1;
        break;
      case DismissalRequestStatus.QUEUED:
        summary.queuedCount += 1;
        break;
      case DismissalRequestStatus.CALLED:
        summary.calledCount += 1;
        break;
      case DismissalRequestStatus.MOVING:
        summary.movingCount += 1;
        break;
      case DismissalRequestStatus.AT_GATE:
        summary.atGateCount += 1;
        break;
      case DismissalRequestStatus.READY:
        summary.readyCount += 1;
        break;
      case DismissalRequestStatus.HANDED_OVER:
        summary.handedOverCount += 1;
        break;
      case DismissalRequestStatus.CANCELLED:
        summary.cancelledCount += 1;
        break;
      case DismissalRequestStatus.EXPIRED:
        summary.expiredCount += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

function presentTimelineEvent(
  event: ParentSmartPickupRecentCallRecord['events'][number],
): ParentSmartPickupRecentCallTimelineEventDto {
  return {
    type: presentTimelineEventType(event.type),
    statusFrom: event.statusFrom ? presentRequestStatus(event.statusFrom) : null,
    statusTo: event.statusTo ? presentRequestStatus(event.statusTo) : null,
    createdAt: event.createdAt.toISOString(),
    note: event.note ?? null,
  };
}

function presentTimelineEventType(
  type: DismissalRequestEventType,
): ParentSmartPickupRecentCallTimelineEventDto['type'] {
  switch (type) {
    case DismissalRequestEventType.REQUEST_STATUS_CHANGED:
      return 'request_status_changed';
    case DismissalRequestEventType.REQUEST_CREATED:
    default:
      return 'request_created';
  }
}

export function presentRequestStatus(
  status: DismissalRequestStatus,
): ParentSmartPickupRecentStatus {
  return status.toLowerCase() as ParentSmartPickupRecentStatus;
}

function isActiveStatus(status: DismissalRequestStatus): boolean {
  return (
    status === DismissalRequestStatus.REQUESTED ||
    status === DismissalRequestStatus.QUEUED ||
    status === DismissalRequestStatus.CALLED ||
    status === DismissalRequestStatus.MOVING ||
    status === DismissalRequestStatus.AT_GATE ||
    status === DismissalRequestStatus.READY
  );
}

function isTerminalStatus(status: DismissalRequestStatus): boolean {
  return (
    status === DismissalRequestStatus.HANDED_OVER ||
    status === DismissalRequestStatus.CANCELLED ||
    status === DismissalRequestStatus.EXPIRED
  );
}

function statusChangedAt(
  request: ParentSmartPickupRecentCallRecord,
  status: DismissalRequestStatus,
): string | null {
  const event = request.events.find((candidate) => candidate.statusTo === status);
  return event?.createdAt.toISOString() ?? null;
}

function displayName(parts: Array<string | null | undefined>): string | null {
  const value = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return value || null;
}

function label(record: { nameEn?: string | null; nameAr?: string | null } | null): string | null {
  return record?.nameEn || record?.nameAr || null;
}
