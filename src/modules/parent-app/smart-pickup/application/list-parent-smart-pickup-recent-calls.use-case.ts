import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  ParentSmartPickupRecentCallsQueryDto,
  ParentSmartPickupRecentCallsResponseDto,
} from '../dto/parent-smart-pickup-recent-calls.dto';
import { ParentSmartPickupRecentCallsRepository } from '../infrastructure/parent-smart-pickup-recent-calls.repository';
import { ParentSmartPickupRecentCallsPresenter } from '../presenter/parent-smart-pickup-recent-calls.presenter';
import {
  DismissalRequestInvalidRecentFilterException,
  ParentSmartPickupInvalidActorTypeException,
  ParentSmartPickupSchoolContextRequiredException,
} from './parent-smart-pickup.errors';

const ALL_RECENT_STATUSES: DismissalRequestStatus[] = [
  DismissalRequestStatus.REQUESTED,
  DismissalRequestStatus.QUEUED,
  DismissalRequestStatus.CALLED,
  DismissalRequestStatus.MOVING,
  DismissalRequestStatus.AT_GATE,
  DismissalRequestStatus.READY,
  DismissalRequestStatus.HANDED_OVER,
  DismissalRequestStatus.CANCELLED,
  DismissalRequestStatus.EXPIRED,
];

const ACTIVE_RECENT_STATUSES: DismissalRequestStatus[] = [
  DismissalRequestStatus.REQUESTED,
  DismissalRequestStatus.QUEUED,
  DismissalRequestStatus.CALLED,
  DismissalRequestStatus.MOVING,
  DismissalRequestStatus.AT_GATE,
  DismissalRequestStatus.READY,
];

type RecentCallsSort =
  | 'requested_at_desc'
  | 'requested_at_asc'
  | 'updated_at_desc';

interface ParentSmartPickupRecentCallsScope {
  actorId: string;
  userType: UserType;
  schoolId: string;
  organizationId: string | null;
}

@Injectable()
export class ListParentSmartPickupRecentCallsUseCase {
  constructor(
    private readonly recentCallsRepository: ParentSmartPickupRecentCallsRepository,
  ) {}

  async execute(
    query: ParentSmartPickupRecentCallsQueryDto,
  ): Promise<ParentSmartPickupRecentCallsResponseDto> {
    const scope = resolveParentSmartPickupScope();
    const status = parseRecentStatus(query.status);
    const activeOnly = parseOptionalBoolean(query.activeOnly) ?? false;
    const sort = parseRecentCallsSort(query.sort);
    const pagination = normalizePagination({
      page: query.page,
      limit: query.limit,
    });

    const statuses = resolveStatuses({ status, activeOnly });
    const [settings, requests] = await Promise.all([
      this.recentCallsRepository.findSettings(),
      this.recentCallsRepository.listOwnedRequests({
        parentUserId: scope.actorId,
        childId: query.childId,
        statuses,
      }),
    ]);

    const sortedRequests = sortRequests(requests, sort);
    const start = (pagination.page - 1) * pagination.limit;
    const pageRequests = sortedRequests.slice(start, start + pagination.limit);

    return ParentSmartPickupRecentCallsPresenter.presentList({
      requests: sortedRequests,
      pageRequests,
      settings,
      page: pagination.page,
      limit: pagination.limit,
    });
  }
}

export function resolveParentSmartPickupScope(): ParentSmartPickupRecentCallsScope {
  const context = getRequestContext();
  if (!context?.actor) {
    throw new ParentSmartPickupInvalidActorTypeException({
      reason: 'actor_missing',
    });
  }
  if (context.actor.userType !== UserType.PARENT) {
    throw new ParentSmartPickupInvalidActorTypeException({
      reason: 'actor_not_parent',
      userType: context.actor.userType,
    });
  }
  if (!context.activeMembership?.schoolId) {
    throw new ParentSmartPickupSchoolContextRequiredException({
      reason: 'active_school_missing',
    });
  }

  return {
    actorId: context.actor.id,
    userType: context.actor.userType,
    schoolId: context.activeMembership.schoolId,
    organizationId: context.activeMembership.organizationId,
  };
}

export function parseRecentStatus(
  value: unknown,
): DismissalRequestStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new DismissalRequestInvalidRecentFilterException({
      field: 'status',
    });
  }

  const normalized = value.trim().toUpperCase();
  const candidate =
    normalized === 'AT_GATE' || normalized === 'AT-GATE'
      ? DismissalRequestStatus.AT_GATE
      : normalized === 'HANDED_OVER' || normalized === 'HANDED-OVER'
        ? DismissalRequestStatus.HANDED_OVER
        : DismissalRequestStatus[
            normalized as keyof typeof DismissalRequestStatus
          ];

  if (!candidate || !ALL_RECENT_STATUSES.includes(candidate)) {
    throw new DismissalRequestInvalidRecentFilterException({
      field: 'status',
    });
  }

  return candidate;
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') {
    throw new DismissalRequestInvalidRecentFilterException({
      field: 'activeOnly',
    });
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  throw new DismissalRequestInvalidRecentFilterException({
    field: 'activeOnly',
  });
}

function resolveStatuses(params: {
  status: DismissalRequestStatus | undefined;
  activeOnly: boolean;
}): DismissalRequestStatus[] {
  const base = params.activeOnly ? ACTIVE_RECENT_STATUSES : ALL_RECENT_STATUSES;
  if (!params.status) return base;
  return base.includes(params.status) ? [params.status] : [];
}

function parseRecentCallsSort(value: unknown): RecentCallsSort {
  if (value === undefined || value === null || value === '') {
    return 'updated_at_desc';
  }
  if (typeof value !== 'string') {
    throw new DismissalRequestInvalidRecentFilterException({ field: 'sort' });
  }

  switch (value.trim().toLowerCase()) {
    case 'requested_at_desc':
    case 'requested_at_asc':
    case 'updated_at_desc':
      return value.trim().toLowerCase() as RecentCallsSort;
    default:
      throw new DismissalRequestInvalidRecentFilterException({ field: 'sort' });
  }
}

function normalizePagination(params: {
  page: number | undefined;
  limit: number | undefined;
}): { page: number; limit: number } {
  return {
    page: params.page ?? 1,
    limit: Math.min(params.limit ?? 20, 100),
  };
}

function sortRequests<T extends { requestedAt: Date; updatedAt: Date; id: string }>(
  requests: T[],
  sort: RecentCallsSort,
): T[] {
  const sorted = [...requests];
  sorted.sort((left, right) => {
    if (sort === 'requested_at_asc') {
      return compareDateAsc(left.requestedAt, right.requestedAt) ||
        left.id.localeCompare(right.id);
    }
    if (sort === 'requested_at_desc') {
      return compareDateDesc(left.requestedAt, right.requestedAt) ||
        left.id.localeCompare(right.id);
    }

    return compareDateDesc(left.updatedAt, right.updatedAt) ||
      compareDateDesc(left.requestedAt, right.requestedAt) ||
      left.id.localeCompare(right.id);
  });

  return sorted;
}

function compareDateAsc(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function compareDateDesc(left: Date, right: Date): number {
  return right.getTime() - left.getTime();
}
