import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ACTIVE_DISMISSAL_REQUEST_STATUSES,
  parseActiveRequestStatus,
} from '../../shared/dismissal.types';
import {
  ActiveDismissalRequestsListResponseDto,
  ListActiveDismissalRequestsQueryDto,
} from '../dto/dismissal-request-query.dto';
import {
  DismissalRequestQueueRecord,
  DismissalRequestsReadRepository,
} from '../infrastructure/dismissal-requests-read.repository';
import { presentActiveDismissalRequestsList } from '../presenter/dismissal-request-queue.presenter';
import {
  computeDismissalRequestSignals,
  DismissalRequestQueueSort,
  DismissalRequestSignalThresholds,
  normalizeQueuePagination,
  parseQueueSort,
  requestStatusPriority,
  requireDismissalRequestQueueScope,
} from './dismissal-request-queue-scope';
import { DismissalStaffQueueAssignmentRecord } from '../infrastructure/dismissal-requests-read.repository';

@Injectable()
export class ListActiveDismissalRequestsUseCase {
  constructor(
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(
    query: ListActiveDismissalRequestsQueryDto,
  ): Promise<ActiveDismissalRequestsListResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const status = parseActiveRequestStatus(query.status);
    const sort = parseQueueSort(query.sort);
    const pagination = normalizeQueuePagination({
      page: query.page,
      limit: query.limit,
    });

    const [thresholdSettings, allRequests, assignments] = await Promise.all([
      this.dismissalRequestsReadRepository.findSettingsThresholds(),
      this.dismissalRequestsReadRepository.listActiveRequests({
        status,
        gateId: query.gateId,
        stageId: query.stageId,
        gradeId: query.gradeId,
        sectionId: query.sectionId,
        classroomId: query.classroomId,
        q: query.q?.trim() || undefined,
      }),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.dismissalRequestsReadRepository.listActiveStaffAssignments({
            staffUserId: scope.actorId,
            now,
          })
        : Promise.resolve([]),
    ]);

    const thresholds = resolveThresholds(thresholdSettings);
    const visibleRequests =
      scope.userType === UserType.DISMISSAL_STAFF
        ? allRequests.filter((request) =>
            isRequestVisibleToStaff(request, assignments),
          )
        : allRequests;

    const sortedRequests = sortRequests(visibleRequests, sort, thresholds, now);
    const start = (pagination.page - 1) * pagination.limit;
    const pageRequests = sortedRequests.slice(start, start + pagination.limit);

    return presentActiveDismissalRequestsList({
      allVisibleRequests: sortedRequests,
      pageRequests,
      thresholds,
      now,
      page: pagination.page,
      limit: pagination.limit,
    });
  }
}

export function resolveThresholds(
  settings: { delayThresholdMinutes: number; urgentThresholdMinutes: number } | null,
): DismissalRequestSignalThresholds {
  return {
    delayThresholdMinutes: settings?.delayThresholdMinutes ?? 15,
    urgentThresholdMinutes: settings?.urgentThresholdMinutes ?? 30,
  };
}

export function isRequestVisibleToStaff(
  request: DismissalRequestQueueRecord,
  assignments: DismissalStaffQueueAssignmentRecord[],
): boolean {
  return assignments.some((assignment) =>
    doesAssignmentMatchRequest(assignment, request),
  );
}

function doesAssignmentMatchRequest(
  assignment: DismissalStaffQueueAssignmentRecord,
  request: DismissalRequestQueueRecord,
): boolean {
  const classroom = request.enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;

  if (assignment.gateId && assignment.gateId !== request.gateId) return false;
  if (assignment.classroomId && assignment.classroomId !== classroom.id) {
    return false;
  }
  if (assignment.sectionId && assignment.sectionId !== section.id) {
    return false;
  }
  if (assignment.gradeId && assignment.gradeId !== grade.id) return false;
  if (assignment.stageId && assignment.stageId !== grade.stage.id) return false;

  return true;
}

function sortRequests(
  requests: DismissalRequestQueueRecord[],
  sort: DismissalRequestQueueSort,
  thresholds: DismissalRequestSignalThresholds,
  now: Date,
): DismissalRequestQueueRecord[] {
  const sorted = [...requests];

  sorted.sort((left, right) => {
    if (sort === 'requested_at_asc') {
      return compareDateAsc(left.requestedAt, right.requestedAt);
    }
    if (sort === 'requested_at_desc') {
      return compareDateDesc(left.requestedAt, right.requestedAt);
    }

    const leftSignals = computeDismissalRequestSignals({
      requestedAt: left.requestedAt,
      now,
      thresholds,
    });
    const rightSignals = computeDismissalRequestSignals({
      requestedAt: right.requestedAt,
      now,
      thresholds,
    });
    const leftUrgency =
      (leftSignals.urgent ? 2 : leftSignals.delayed ? 1 : 0) * 10 +
      requestStatusPriority(left.status);
    const rightUrgency =
      (rightSignals.urgent ? 2 : rightSignals.delayed ? 1 : 0) * 10 +
      requestStatusPriority(right.status);

    if (rightUrgency !== leftUrgency) return rightUrgency - leftUrgency;
    return compareDateAsc(left.requestedAt, right.requestedAt);
  });

  return sorted.filter((request) =>
    ACTIVE_DISMISSAL_REQUEST_STATUSES.includes(request.status),
  );
}

function compareDateAsc(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function compareDateDesc(left: Date, right: Date): number {
  return right.getTime() - left.getTime();
}
