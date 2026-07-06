import {
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
} from '@prisma/client';
import {
  ACTIVE_DISMISSAL_REQUEST_STATUSES,
} from '../../shared/dismissal.types';
import {
  DismissalEscalationReason,
  EscalateDismissalRequestResponseDto,
} from '../dto/escalate-dismissal-request.dto';
import {
  DismissalHistoryEscalationDto,
  DismissalHistoryWaitDto,
  DismissalRequestHistoryDetailResponseDto,
  DismissalRequestHistoryItemDto,
  DismissalRequestHistoryListResponseDto,
  DismissalRequestHistorySummaryDto,
  DismissalRequestHistoryTimelineEventDto,
  PublicDismissalHistoryStatus,
} from '../dto/list-dismissal-request-history.dto';
import {
  DismissalRequestSignalThresholds,
} from '../application/dismissal-request-queue-scope';
import {
  DismissalRequestHistoryRecord,
} from '../infrastructure/dismissal-requests-history.repository';

export function presentDismissalRequestHistoryList(params: {
  allVisibleRequests: DismissalRequestHistoryRecord[];
  pageRequests: DismissalRequestHistoryRecord[];
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
  page: number;
  limit: number;
}): DismissalRequestHistoryListResponseDto {
  return {
    data: params.pageRequests.map((request) =>
      presentHistoryItem({
        request,
        thresholds: params.thresholds,
        now: params.now,
      }),
    ),
    summary: summarizeHistory({
      requests: params.allVisibleRequests,
      thresholds: params.thresholds,
      now: params.now,
    }),
    pagination: {
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(
        1,
        Math.ceil(params.allVisibleRequests.length / params.limit),
      ),
    },
  };
}

export function presentDismissalRequestHistoryDetail(params: {
  request: DismissalRequestHistoryRecord;
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): DismissalRequestHistoryDetailResponseDto {
  return {
    request: {
      ...presentHistoryItem(params),
      timeline: params.request.events.map(presentHistoryTimelineEvent),
    },
  };
}

export function presentDismissalRequestEscalation(params: {
  request: DismissalRequestHistoryRecord;
  changed: boolean;
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): EscalateDismissalRequestResponseDto {
  const escalation = presentEscalation(params.request);
  const wait = computeHistoryWait({
    request: params.request,
    thresholds: params.thresholds,
    now: params.now,
  });

  return {
    escalation: {
      requestId: params.request.id,
      changed: params.changed,
      escalated: true,
      escalatedAt: escalation.escalatedAt ?? params.now.toISOString(),
      reason: (escalation.reason ?? 'other') as DismissalEscalationReason,
    },
    request: {
      id: params.request.id,
      status: presentHistoryStatus(params.request.status),
      isActive: isActiveHistoryStatus(params.request.status),
      isTerminal: isTerminalHistoryStatus(params.request.status),
      wait: {
        minutes: wait.minutes,
        delayed: wait.delayed,
        urgent: wait.urgent,
      },
    },
  };
}

export function computeHistoryWait(params: {
  request: DismissalRequestHistoryRecord;
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): DismissalHistoryWaitDto {
  const until = isTerminalHistoryStatus(params.request.status)
    ? resolveTerminalAt(params.request) ?? params.request.updatedAt
    : params.now;
  const minutes = Math.max(
    0,
    Math.floor(
      (until.getTime() - params.request.requestedAt.getTime()) / 60_000,
    ),
  );

  return {
    minutes,
    delayed: minutes >= params.thresholds.delayThresholdMinutes,
    urgent: minutes >= params.thresholds.urgentThresholdMinutes,
    thresholdMinutes: params.thresholds.delayThresholdMinutes,
    urgentThresholdMinutes: params.thresholds.urgentThresholdMinutes,
  };
}

export function requestHasEscalation(
  request: DismissalRequestHistoryRecord,
): boolean {
  return Boolean(findEscalationEvent(request));
}

function presentHistoryItem(params: {
  request: DismissalRequestHistoryRecord;
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): DismissalRequestHistoryItemDto {
  const classroom = params.request.enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;

  return {
    id: params.request.id,
    status: presentHistoryStatus(params.request.status),
    isActive: isActiveHistoryStatus(params.request.status),
    isTerminal: isTerminalHistoryStatus(params.request.status),
    requestedAt: params.request.requestedAt.toISOString(),
    updatedAt: params.request.updatedAt?.toISOString() ?? null,
    calledAt: statusChangedAt(params.request, DismissalRequestStatus.CALLED),
    readyAt: statusChangedAt(params.request, DismissalRequestStatus.READY),
    handedOverAt:
      params.request.handedOverAt?.toISOString() ??
      statusChangedAt(params.request, DismissalRequestStatus.HANDED_OVER),
    cancelledAt: statusChangedAt(
      params.request,
      DismissalRequestStatus.CANCELLED,
    ),
    expiredAt: statusChangedAt(params.request, DismissalRequestStatus.EXPIRED),
    wait: computeHistoryWait(params),
    escalation: presentEscalation(params.request),
    child: {
      id: params.request.student.id,
      displayName:
        displayName([
          params.request.student.firstName,
          params.request.student.lastName,
        ]) ?? 'Student',
      grade: label(grade),
      section: label(section),
      classroom: label(classroom),
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

function summarizeHistory(params: {
  requests: DismissalRequestHistoryRecord[];
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): DismissalRequestHistorySummaryDto {
  const summary: DismissalRequestHistorySummaryDto = {
    totalCount: params.requests.length,
    activeCount: 0,
    terminalCount: 0,
    delayedCount: 0,
    urgentCount: 0,
    escalatedCount: 0,
  };

  for (const request of params.requests) {
    if (isActiveHistoryStatus(request.status)) summary.activeCount += 1;
    if (isTerminalHistoryStatus(request.status)) summary.terminalCount += 1;
    if (requestHasEscalation(request)) summary.escalatedCount += 1;

    const wait = computeHistoryWait({
      request,
      thresholds: params.thresholds,
      now: params.now,
    });
    if (wait.delayed) summary.delayedCount += 1;
    if (wait.urgent) summary.urgentCount += 1;
  }

  return summary;
}

function presentEscalation(
  request: DismissalRequestHistoryRecord,
): DismissalHistoryEscalationDto {
  const event = findEscalationEvent(request);
  if (!event) {
    return {
      escalated: false,
      escalatedAt: null,
      reason: null,
      note: null,
    };
  }

  return {
    escalated: true,
    escalatedAt: event.createdAt.toISOString(),
    reason: readEscalationReason(event.metadata),
    note: event.note ?? null,
  };
}

function findEscalationEvent(request: DismissalRequestHistoryRecord) {
  return [...request.events]
    .reverse()
    .find((event) => event.type === DismissalRequestEventType.REQUEST_ESCALATED);
}

function presentHistoryTimelineEvent(
  event: DismissalRequestHistoryRecord['events'][number],
): DismissalRequestHistoryTimelineEventDto {
  return {
    type: presentTimelineEventType(event.type),
    statusFrom: event.statusFrom ? presentHistoryStatus(event.statusFrom) : null,
    statusTo: event.statusTo ? presentHistoryStatus(event.statusTo) : null,
    createdAt: event.createdAt.toISOString(),
    note: event.note ?? null,
  };
}

function presentTimelineEventType(
  type: DismissalRequestEventType,
): DismissalRequestHistoryTimelineEventDto['type'] {
  switch (type) {
    case DismissalRequestEventType.REQUEST_STATUS_CHANGED:
      return 'request_status_changed';
    case DismissalRequestEventType.REQUEST_ESCALATED:
      return 'request_escalated';
    case DismissalRequestEventType.REQUEST_CREATED:
    default:
      return 'request_created';
  }
}

function statusChangedAt(
  request: DismissalRequestHistoryRecord,
  status: DismissalRequestStatus,
): string | null {
  const event = request.events.find((candidate) => candidate.statusTo === status);
  return event?.createdAt.toISOString() ?? null;
}

function resolveTerminalAt(
  request: DismissalRequestHistoryRecord,
): Date | null {
  if (request.status === DismissalRequestStatus.HANDED_OVER) {
    return (
      request.handedOverAt ??
      findStatusEventCreatedAt(request, DismissalRequestStatus.HANDED_OVER)
    );
  }

  if (request.status === DismissalRequestStatus.CANCELLED) {
    return findStatusEventCreatedAt(request, DismissalRequestStatus.CANCELLED);
  }

  if (request.status === DismissalRequestStatus.EXPIRED) {
    return findStatusEventCreatedAt(request, DismissalRequestStatus.EXPIRED);
  }

  return null;
}

function findStatusEventCreatedAt(
  request: DismissalRequestHistoryRecord,
  status: DismissalRequestStatus,
): Date | null {
  const event = request.events.find((candidate) => candidate.statusTo === status);
  return event?.createdAt ?? null;
}

function readEscalationReason(
  metadata: Prisma.JsonValue | null,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const reason = (metadata as Record<string, unknown>).reason;
  return typeof reason === 'string' && reason.trim().length > 0
    ? reason
    : null;
}

function presentHistoryStatus(
  status: DismissalRequestStatus,
): PublicDismissalHistoryStatus {
  return status.toLowerCase() as PublicDismissalHistoryStatus;
}

function isActiveHistoryStatus(status: DismissalRequestStatus): boolean {
  return ACTIVE_DISMISSAL_REQUEST_STATUSES.includes(status);
}

function isTerminalHistoryStatus(status: DismissalRequestStatus): boolean {
  return (
    status === DismissalRequestStatus.HANDED_OVER ||
    status === DismissalRequestStatus.CANCELLED ||
    status === DismissalRequestStatus.EXPIRED
  );
}

function label(record: { nameEn?: string | null; nameAr?: string | null } | null): string | null {
  return record?.nameEn || record?.nameAr || null;
}

function displayName(parts: Array<string | null | undefined>): string | null {
  const value = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return value || null;
}
