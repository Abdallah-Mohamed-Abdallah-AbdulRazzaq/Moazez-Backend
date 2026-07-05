import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, UserType } from '@prisma/client';
import { DismissalWaitingStudentInvalidFilterException } from '../../shared/dismissal.errors';
import {
  parseWaitingRequestStatus,
  WAITING_DISMISSAL_REQUEST_STATUSES,
} from '../../shared/dismissal.types';
import {
  computeDismissalRequestSignals,
  DismissalRequestSignalThresholds,
  normalizeQueuePagination,
  requireDismissalRequestQueueScope,
} from '../../requests/application/dismissal-request-queue-scope';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from '../../requests/application/list-active-dismissal-requests.use-case';
import {
  DismissalRequestQueueRecord,
  DismissalRequestsReadRepository,
} from '../../requests/infrastructure/dismissal-requests-read.repository';
import {
  DismissalWaitingStudentsListResponseDto,
  ListDismissalWaitingStudentsQueryDto,
} from '../dto/dismissal-waiting-students-query.dto';
import { presentDismissalWaitingStudentsList } from '../presenter/dismissal-waiting-students.presenter';

type DismissalWaitingStudentsSort =
  | 'arrival_stage_asc'
  | 'requested_at_asc'
  | 'requested_at_desc'
  | 'urgency_desc';

@Injectable()
export class ListWaitingStudentsUseCase {
  constructor(
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(
    query: ListDismissalWaitingStudentsQueryDto,
  ): Promise<DismissalWaitingStudentsListResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const status = parseWaitingRequestStatus(query.status);
    const sort = parseWaitingStudentsSort(query.sort);
    const pagination = normalizeQueuePagination({
      page: query.page,
      limit: query.limit,
    });

    const [thresholdSettings, activeRequests, assignments] = await Promise.all([
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
    const waitingRequests = activeRequests.filter((request) =>
      WAITING_DISMISSAL_REQUEST_STATUSES.includes(request.status),
    );
    const visibleRequests =
      scope.userType === UserType.DISMISSAL_STAFF
        ? waitingRequests.filter((request) =>
            isRequestVisibleToStaff(request, assignments),
          )
        : waitingRequests;

    const sortedRequests = sortWaitingStudents(
      visibleRequests,
      sort,
      thresholds,
      now,
    );
    const start = (pagination.page - 1) * pagination.limit;
    const pageRequests = sortedRequests.slice(start, start + pagination.limit);

    return presentDismissalWaitingStudentsList({
      allVisibleStudents: sortedRequests,
      pageStudents: pageRequests,
      thresholds,
      now,
      page: pagination.page,
      limit: pagination.limit,
    });
  }
}

function parseWaitingStudentsSort(
  value: unknown,
): DismissalWaitingStudentsSort {
  if (value === undefined || value === null || value === '') {
    return 'arrival_stage_asc';
  }

  if (typeof value !== 'string') {
    throw new DismissalWaitingStudentInvalidFilterException();
  }

  switch (value.trim().toLowerCase()) {
    case 'arrival_stage_asc':
    case 'requested_at_asc':
    case 'requested_at_desc':
    case 'urgency_desc':
      return value.trim().toLowerCase() as DismissalWaitingStudentsSort;
    default:
      throw new DismissalWaitingStudentInvalidFilterException();
  }
}

function sortWaitingStudents(
  requests: DismissalRequestQueueRecord[],
  sort: DismissalWaitingStudentsSort,
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
    if (sort === 'urgency_desc') {
      const urgency = compareUrgency(left, right, thresholds, now);
      if (urgency !== 0) return urgency;
      return compareDateAsc(left.requestedAt, right.requestedAt);
    }

    const leftStage = arrivalStagePriority(left.status);
    const rightStage = arrivalStagePriority(right.status);
    if (leftStage !== rightStage) return leftStage - rightStage;

    const urgency = compareUrgency(left, right, thresholds, now);
    if (urgency !== 0) return urgency;
    return compareDateAsc(left.requestedAt, right.requestedAt);
  });

  return sorted;
}

function compareUrgency(
  left: DismissalRequestQueueRecord,
  right: DismissalRequestQueueRecord,
  thresholds: DismissalRequestSignalThresholds,
  now: Date,
): number {
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
  const leftRank = leftSignals.urgent ? 2 : leftSignals.delayed ? 1 : 0;
  const rightRank = rightSignals.urgent ? 2 : rightSignals.delayed ? 1 : 0;

  return rightRank - leftRank;
}

function arrivalStagePriority(status: DismissalRequestStatus): number {
  switch (status) {
    case DismissalRequestStatus.CALLED:
      return 0;
    case DismissalRequestStatus.MOVING:
      return 1;
    case DismissalRequestStatus.AT_GATE:
      return 2;
    case DismissalRequestStatus.READY:
      return 3;
    default:
      return 4;
  }
}

function compareDateAsc(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function compareDateDesc(left: Date, right: Date): number {
  return right.getTime() - left.getTime();
}
