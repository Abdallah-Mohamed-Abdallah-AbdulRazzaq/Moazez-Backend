import {
  DismissalGateOperationalStatus,
  DismissalRequestEventType,
  DismissalRequestStatus,
} from '@prisma/client';
import {
  computeDismissalRequestSignals,
  DismissalRequestSignalThresholds,
} from '../../requests/application/dismissal-request-queue-scope';
import {
  DismissalRequestDetailRecord,
  DismissalRequestQueueRecord,
} from '../../requests/infrastructure/dismissal-requests-read.repository';
import { DismissalRequestStatusUpdateRecord } from '../../requests/infrastructure/dismissal-requests-write.repository';
import {
  presentArrivalState,
  presentGateStatus,
  presentRequestStatus,
  PublicDismissalWaitingStudentStatus,
} from '../../shared/dismissal.types';
import {
  ConfirmStudentArrivalResponseDto,
  DismissalWaitingStudentItemDto,
  DismissalWaitingStudentsListResponseDto,
  DismissalWaitingStudentsSummaryDto,
} from '../dto/dismissal-waiting-students-query.dto';

type WaitingStudentRecord =
  | DismissalRequestQueueRecord
  | DismissalRequestDetailRecord
  | DismissalRequestStatusUpdateRecord;

type WaitingStudentTimelineRecord =
  | DismissalRequestDetailRecord
  | DismissalRequestStatusUpdateRecord;

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

export function presentDismissalWaitingStudentsList(params: {
  allVisibleStudents: DismissalRequestQueueRecord[];
  pageStudents: DismissalRequestQueueRecord[];
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
  page: number;
  limit: number;
}): DismissalWaitingStudentsListResponseDto {
  return {
    data: params.pageStudents.map((request) =>
      presentWaitingStudent(request, params.thresholds, params.now),
    ),
    summary: summarizeWaitingStudents(
      params.allVisibleStudents,
      params.thresholds,
      params.now,
    ),
    pagination: {
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(
        1,
        Math.ceil(params.allVisibleStudents.length / params.limit),
      ),
    },
  };
}

export function presentStudentArrivalConfirmation(params: {
  request: WaitingStudentTimelineRecord;
  previousStatus: DismissalRequestStatus | null;
  changed: boolean;
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
}): ConfirmStudentArrivalResponseDto {
  return {
    student: {
      ...presentWaitingStudent(params.request, params.thresholds, params.now),
      previousStatus: params.previousStatus
        ? (presentRequestStatus(
            params.previousStatus,
          ) as PublicDismissalWaitingStudentStatus)
        : null,
      changed: params.changed,
      timeline: params.request.events.map(presentTimelineEvent),
    },
  };
}

function presentWaitingStudent(
  request: WaitingStudentRecord,
  thresholds: DismissalRequestSignalThresholds,
  now: Date,
): DismissalWaitingStudentItemDto {
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
    status: presentRequestStatus(
      request.status,
    ) as PublicDismissalWaitingStudentStatus,
    arrivalState: presentArrivalState(request.status),
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
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
      status: presentGateStatus(request.gate.status as DismissalGateOperationalStatus),
    },
  };
}

function summarizeWaitingStudents(
  requests: DismissalRequestQueueRecord[],
  thresholds: DismissalRequestSignalThresholds,
  now: Date,
): DismissalWaitingStudentsSummaryDto {
  const summary: DismissalWaitingStudentsSummaryDto = {
    totalCount: requests.length,
    calledCount: 0,
    movingCount: 0,
    atGateCount: 0,
    readyCount: 0,
    arrivedCount: 0,
    notArrivedCount: 0,
    delayedCount: 0,
    urgentCount: 0,
  };

  for (const request of requests) {
    switch (request.status) {
      case DismissalRequestStatus.CALLED:
        summary.calledCount += 1;
        summary.notArrivedCount += 1;
        break;
      case DismissalRequestStatus.MOVING:
        summary.movingCount += 1;
        summary.notArrivedCount += 1;
        break;
      case DismissalRequestStatus.AT_GATE:
        summary.atGateCount += 1;
        summary.arrivedCount += 1;
        break;
      case DismissalRequestStatus.READY:
        summary.readyCount += 1;
        summary.arrivedCount += 1;
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
  event: WaitingStudentTimelineRecord['events'][number],
) {
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
): 'request_created' | 'request_status_changed' {
  switch (type) {
    case DismissalRequestEventType.REQUEST_STATUS_CHANGED:
      return 'request_status_changed';
    case DismissalRequestEventType.REQUEST_CREATED:
    default:
      return 'request_created';
  }
}
