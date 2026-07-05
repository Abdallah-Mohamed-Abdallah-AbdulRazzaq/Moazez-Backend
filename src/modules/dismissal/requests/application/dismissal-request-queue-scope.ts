import { DismissalRequestStatus, UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { TokenInvalidException } from '../../../iam/auth/domain/auth.exceptions';
import {
  DismissalRequestInvalidQueueFilterException,
  DismissalRequestSchoolContextRequiredException,
} from '../../shared/dismissal.errors';

export const DEFAULT_DISMISSAL_REQUEST_PAGE = 1;
export const DEFAULT_DISMISSAL_REQUEST_LIMIT = 20;

export type DismissalRequestQueueSort =
  | 'requested_at_asc'
  | 'requested_at_desc'
  | 'urgency_desc';

export interface DismissalRequestQueueScope {
  actorId: string;
  userType: UserType;
  schoolId: string;
}

export interface DismissalRequestSignalThresholds {
  delayThresholdMinutes: number;
  urgentThresholdMinutes: number;
}

export interface DismissalRequestSignals {
  waitMinutes: number;
  delayed: boolean;
  urgent: boolean;
  delayThresholdMinutes: number;
  urgentThresholdMinutes: number;
}

export function requireDismissalRequestQueueScope(): DismissalRequestQueueScope {
  const ctx = getRequestContext();

  if (!ctx?.actor) {
    throw new TokenInvalidException();
  }

  if (!ctx.activeMembership?.schoolId) {
    throw new DismissalRequestSchoolContextRequiredException();
  }

  return {
    actorId: ctx.actor.id,
    userType: ctx.actor.userType,
    schoolId: ctx.activeMembership.schoolId,
  };
}

export function parseQueueSort(
  value: unknown,
): DismissalRequestQueueSort {
  if (value === undefined || value === null || value === '') {
    return 'urgency_desc';
  }

  if (typeof value !== 'string') {
    throw new DismissalRequestInvalidQueueFilterException();
  }

  switch (value.trim().toLowerCase()) {
    case 'requested_at_asc':
    case 'requested_at_desc':
    case 'urgency_desc':
      return value.trim().toLowerCase() as DismissalRequestQueueSort;
    default:
      throw new DismissalRequestInvalidQueueFilterException();
  }
}

export function normalizeQueuePagination(params: {
  page?: number;
  limit?: number;
}): { page: number; limit: number } {
  return {
    page: params.page ?? DEFAULT_DISMISSAL_REQUEST_PAGE,
    limit: params.limit ?? DEFAULT_DISMISSAL_REQUEST_LIMIT,
  };
}

export function computeDismissalRequestSignals(params: {
  requestedAt: Date;
  now: Date;
  thresholds: DismissalRequestSignalThresholds;
}): DismissalRequestSignals {
  const waitMinutes = Math.max(
    0,
    Math.floor(
      (params.now.getTime() - params.requestedAt.getTime()) / 60_000,
    ),
  );

  return {
    waitMinutes,
    delayed: waitMinutes >= params.thresholds.delayThresholdMinutes,
    urgent: waitMinutes >= params.thresholds.urgentThresholdMinutes,
    delayThresholdMinutes: params.thresholds.delayThresholdMinutes,
    urgentThresholdMinutes: params.thresholds.urgentThresholdMinutes,
  };
}

export function requestStatusPriority(status: DismissalRequestStatus): number {
  switch (status) {
    case DismissalRequestStatus.READY:
      return 5;
    case DismissalRequestStatus.AT_GATE:
      return 4;
    case DismissalRequestStatus.MOVING:
      return 3;
    case DismissalRequestStatus.CALLED:
      return 2;
    case DismissalRequestStatus.QUEUED:
      return 1;
    case DismissalRequestStatus.REQUESTED:
    default:
      return 0;
  }
}
