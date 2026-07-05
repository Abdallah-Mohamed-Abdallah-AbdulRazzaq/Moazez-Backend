import { DismissalRequestEventType, DismissalRequestStatus } from '@prisma/client';
import {
  ActiveDismissalRequestQueueItemDto,
  ActiveDismissalRequestsListResponseDto,
  ActiveDismissalRequestsSummaryDto,
  DismissalRequestDetailResponseDto,
  DismissalRequestTimelineEventDto,
} from '../dto/dismissal-request-query.dto';
import {
  computeDismissalRequestSignals,
  DismissalRequestSignalThresholds,
} from '../application/dismissal-request-queue-scope';
import {
  DismissalRequestDetailRecord,
  DismissalRequestQueueRecord,
} from '../infrastructure/dismissal-requests-read.repository';
import { presentGateStatus, presentRequestStatus } from '../../shared/dismissal.types';

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

function presentQueueItem(
  request: DismissalRequestQueueRecord,
  thresholds: DismissalRequestSignalThresholds,
  now: Date,
): ActiveDismissalRequestQueueItemDto {
  const signals = computeDismissalRequestSignals({
    requestedAt: request.requestedAt,
    now,
    thresholds,
  });
  const classroom = request.enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;

  return {
    id: request.id,
    status: presentRequestStatus(request.status),
    requestedAt: request.requestedAt.toISOString(),
    waitMinutes: signals.waitMinutes,
    signals: {
      delayed: signals.delayed,
      urgent: signals.urgent,
      delayThresholdMinutes: signals.delayThresholdMinutes,
      urgentThresholdMinutes: signals.urgentThresholdMinutes,
    },
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
    requester: {
      displayName: displayName([
        request.requestedBy.firstName,
        request.requestedBy.lastName,
      ]),
    },
  };
}

export function presentActiveDismissalRequestsList(params: {
  allVisibleRequests: DismissalRequestQueueRecord[];
  pageRequests: DismissalRequestQueueRecord[];
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
  page: number;
  limit: number;
}): ActiveDismissalRequestsListResponseDto {
  const summary = summarizeRequests(
    params.allVisibleRequests,
    params.thresholds,
    params.now,
  );

  return {
    data: params.pageRequests.map((request) =>
      presentQueueItem(request, params.thresholds, params.now),
    ),
    summary,
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

export function presentDismissalRequestDetail(params: {
  request: DismissalRequestDetailRecord;
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): DismissalRequestDetailResponseDto {
  return {
    request: {
      ...presentQueueItem(params.request, params.thresholds, params.now),
      timeline: params.request.events.map(presentTimelineEvent),
    },
  };
}

function summarizeRequests(
  requests: DismissalRequestQueueRecord[],
  thresholds: DismissalRequestSignalThresholds,
  now: Date,
): ActiveDismissalRequestsSummaryDto {
  const summary: ActiveDismissalRequestsSummaryDto = {
    totalCount: requests.length,
    requestedCount: 0,
    queuedCount: 0,
    calledCount: 0,
    movingCount: 0,
    atGateCount: 0,
    readyCount: 0,
    delayedCount: 0,
    urgentCount: 0,
  };

  for (const request of requests) {
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
      default:
        break;
    }

    const signals = computeDismissalRequestSignals({
      requestedAt: request.requestedAt,
      now,
      thresholds,
    });
    if (signals.delayed) summary.delayedCount += 1;
    if (signals.urgent) summary.urgentCount += 1;
  }

  return summary;
}

function presentTimelineEvent(
  event: DismissalRequestDetailRecord['events'][number],
): DismissalRequestTimelineEventDto {
  return {
    type:
      event.type === DismissalRequestEventType.REQUEST_CREATED
        ? 'request_created'
        : 'request_created',
    statusFrom: event.statusFrom ? presentRequestStatus(event.statusFrom) : null,
    statusTo: event.statusTo ? presentRequestStatus(event.statusTo) : null,
    createdAt: event.createdAt.toISOString(),
    note: event.note ?? null,
  };
}
