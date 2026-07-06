import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, UserType } from '@prisma/client';
import { ACTIVE_DISMISSAL_REQUEST_STATUSES } from '../../shared/dismissal.types';
import {
  DismissalHistoryInvalidDateRangeException,
  DismissalHistoryInvalidFilterCombinationException,
  DismissalHistoryInvalidStatusFilterException,
} from '../../shared/dismissal.errors';
import {
  ListDismissalRequestHistoryQueryDto,
  DismissalRequestHistoryListResponseDto,
} from '../dto/list-dismissal-request-history.dto';
import {
  DismissalRequestHistoryRecord,
  DismissalRequestsHistoryRepository,
} from '../infrastructure/dismissal-requests-history.repository';
import {
  computeHistoryWait,
  presentDismissalRequestHistoryList,
  requestHasEscalation,
} from '../presenter/dismissal-request-history.presenter';
import {
  DEFAULT_DISMISSAL_REQUEST_LIMIT,
  DEFAULT_DISMISSAL_REQUEST_PAGE,
  DismissalRequestSignalThresholds,
  requireDismissalRequestQueueScope,
} from './dismissal-request-queue-scope';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from './list-active-dismissal-requests.use-case';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';

type DismissalRequestHistorySort =
  | 'created_at_desc'
  | 'created_at_asc'
  | 'updated_at_desc'
  | 'wait_minutes_desc';

const TERMINAL_DISMISSAL_REQUEST_STATUSES: DismissalRequestStatus[] = [
  DismissalRequestStatus.HANDED_OVER,
  DismissalRequestStatus.CANCELLED,
  DismissalRequestStatus.EXPIRED,
];

@Injectable()
export class ListDismissalRequestHistoryUseCase {
  constructor(
    private readonly historyRepository: DismissalRequestsHistoryRepository,
    private readonly readRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(
    query: ListDismissalRequestHistoryQueryDto,
  ): Promise<DismissalRequestHistoryListResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const statusResolution = resolveHistoryStatuses(query);
    const dateRange = parseDateRange({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    const sort = parseHistorySort(query.sort);
    const page = query.page ?? DEFAULT_DISMISSAL_REQUEST_PAGE;
    const limit = query.limit ?? DEFAULT_DISMISSAL_REQUEST_LIMIT;

    const [thresholdSettings, allRequests, assignments] = await Promise.all([
      this.historyRepository.findSettingsThresholds(),
      statusResolution.empty
        ? Promise.resolve([])
        : this.historyRepository.listHistoryRequests({
            statuses: statusResolution.statuses,
            childId: query.childId,
            gateId: query.gateId,
            stageId: query.stageId,
            gradeId: query.gradeId,
            sectionId: query.sectionId,
            classroomId: query.classroomId,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
          }),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.readRepository.listActiveStaffAssignments({
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
    const filteredRequests = applyComputedFilters({
      requests: visibleRequests,
      thresholds,
      now,
      delayedOnly: query.delayedOnly,
      urgentOnly: query.urgentOnly,
      escalatedOnly: query.escalatedOnly,
    });
    const sortedRequests = sortHistoryRequests(filteredRequests, sort, {
      thresholds,
      now,
    });
    const start = (page - 1) * limit;
    const pageRequests = sortedRequests.slice(start, start + limit);

    return presentDismissalRequestHistoryList({
      allVisibleRequests: sortedRequests,
      pageRequests,
      thresholds,
      now,
      page,
      limit,
    });
  }
}

export function parseHistoryStatus(value: string): DismissalRequestStatus {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'requested':
      return DismissalRequestStatus.REQUESTED;
    case 'queued':
      return DismissalRequestStatus.QUEUED;
    case 'called':
      return DismissalRequestStatus.CALLED;
    case 'moving':
      return DismissalRequestStatus.MOVING;
    case 'at_gate':
      return DismissalRequestStatus.AT_GATE;
    case 'ready':
      return DismissalRequestStatus.READY;
    case 'handed_over':
      return DismissalRequestStatus.HANDED_OVER;
    case 'cancelled':
      return DismissalRequestStatus.CANCELLED;
    case 'expired':
      return DismissalRequestStatus.EXPIRED;
    default:
      throw new DismissalHistoryInvalidStatusFilterException();
  }
}

function resolveHistoryStatuses(
  query: ListDismissalRequestHistoryQueryDto,
): { statuses?: DismissalRequestStatus[]; empty: boolean } {
  if (query.activeOnly === true && query.terminalOnly === true) {
    throw new DismissalHistoryInvalidFilterCombinationException();
  }

  const explicitStatuses = new Set<DismissalRequestStatus>();
  if (query.status?.trim()) {
    explicitStatuses.add(parseHistoryStatus(query.status));
  }
  if (query.statuses?.trim()) {
    for (const part of query.statuses.split(',')) {
      if (!part.trim()) continue;
      explicitStatuses.add(parseHistoryStatus(part));
    }
  }

  let statuses = [...explicitStatuses];
  if (statuses.length === 0) {
    if (query.activeOnly === true) {
      statuses = [...ACTIVE_DISMISSAL_REQUEST_STATUSES];
    } else if (query.terminalOnly === true) {
      statuses = [...TERMINAL_DISMISSAL_REQUEST_STATUSES];
    } else {
      return { statuses: undefined, empty: false };
    }
  } else if (query.activeOnly === true) {
    statuses = statuses.filter((status) =>
      ACTIVE_DISMISSAL_REQUEST_STATUSES.includes(status),
    );
  } else if (query.terminalOnly === true) {
    statuses = statuses.filter((status) =>
      TERMINAL_DISMISSAL_REQUEST_STATUSES.includes(status),
    );
  }

  return { statuses, empty: statuses.length === 0 };
}

function parseDateRange(params: {
  dateFrom?: string;
  dateTo?: string;
}): { dateFrom?: Date; dateTo?: Date } {
  const dateFrom = params.dateFrom ? new Date(params.dateFrom) : undefined;
  const dateTo = params.dateTo ? new Date(params.dateTo) : undefined;

  if (
    (dateFrom && Number.isNaN(dateFrom.getTime())) ||
    (dateTo && Number.isNaN(dateTo.getTime())) ||
    (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime())
  ) {
    throw new DismissalHistoryInvalidDateRangeException();
  }

  return { dateFrom, dateTo };
}

function parseHistorySort(value: unknown): DismissalRequestHistorySort {
  if (value === undefined || value === null || value === '') {
    return 'created_at_desc';
  }

  if (typeof value !== 'string') {
    throw new DismissalHistoryInvalidFilterCombinationException();
  }

  switch (value.trim().toLowerCase()) {
    case 'created_at_desc':
    case 'created_at_asc':
    case 'updated_at_desc':
    case 'wait_minutes_desc':
      return value.trim().toLowerCase() as DismissalRequestHistorySort;
    default:
      throw new DismissalHistoryInvalidFilterCombinationException();
  }
}

function applyComputedFilters(params: {
  requests: DismissalRequestHistoryRecord[];
  thresholds: DismissalRequestSignalThresholds;
  now: Date;
  delayedOnly?: boolean;
  urgentOnly?: boolean;
  escalatedOnly?: boolean;
}): DismissalRequestHistoryRecord[] {
  return params.requests.filter((request) => {
    const wait = computeHistoryWait({
      request,
      thresholds: params.thresholds,
      now: params.now,
    });

    if (params.delayedOnly === true && !wait.delayed) return false;
    if (params.urgentOnly === true && !wait.urgent) return false;
    if (params.escalatedOnly === true && !requestHasEscalation(request)) {
      return false;
    }

    return true;
  });
}

function sortHistoryRequests(
  requests: DismissalRequestHistoryRecord[],
  sort: DismissalRequestHistorySort,
  params: {
    thresholds: DismissalRequestSignalThresholds;
    now: Date;
  },
): DismissalRequestHistoryRecord[] {
  return [...requests].sort((left, right) => {
    switch (sort) {
      case 'created_at_asc':
        return left.createdAt.getTime() - right.createdAt.getTime();
      case 'updated_at_desc':
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      case 'wait_minutes_desc': {
        const leftWait = computeHistoryWait({
          request: left,
          thresholds: params.thresholds,
          now: params.now,
        }).minutes;
        const rightWait = computeHistoryWait({
          request: right,
          thresholds: params.thresholds,
          now: params.now,
        }).minutes;
        return rightWait - leftWait || right.createdAt.getTime() - left.createdAt.getTime();
      }
      case 'created_at_desc':
      default:
        return right.createdAt.getTime() - left.createdAt.getTime();
    }
  });
}
