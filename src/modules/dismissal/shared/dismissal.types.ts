import {
  DismissalGateOperationalStatus,
  DismissalRequestStatus,
} from '@prisma/client';
import {
  DismissalInvalidStatusException,
  DismissalRequestInvalidStatusException,
  DismissalRequestInvalidStatusFilterException,
  DismissalRequestTerminalStatusException,
} from './dismissal.errors';

export type PublicDismissalGateStatus =
  | 'open'
  | 'busy'
  | 'closed'
  | 'maintenance';

export type PublicDismissalRequestStatus =
  | 'requested'
  | 'queued'
  | 'called'
  | 'moving'
  | 'at_gate'
  | 'ready';

export function presentGateStatus(
  status: DismissalGateOperationalStatus,
): PublicDismissalGateStatus {
  return status.toLowerCase() as PublicDismissalGateStatus;
}

export function parseGateStatus(
  value: unknown,
): DismissalGateOperationalStatus | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DismissalInvalidStatusException();
  }

  switch (value.trim().toUpperCase()) {
    case 'OPEN':
      return DismissalGateOperationalStatus.OPEN;
    case 'BUSY':
      return DismissalGateOperationalStatus.BUSY;
    case 'CLOSED':
      return DismissalGateOperationalStatus.CLOSED;
    case 'MAINTENANCE':
      return DismissalGateOperationalStatus.MAINTENANCE;
    default:
      throw new DismissalInvalidStatusException();
  }
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return undefined;
}

export const ACTIVE_DISMISSAL_REQUEST_STATUSES: DismissalRequestStatus[] = [
  DismissalRequestStatus.REQUESTED,
  DismissalRequestStatus.QUEUED,
  DismissalRequestStatus.CALLED,
  DismissalRequestStatus.MOVING,
  DismissalRequestStatus.AT_GATE,
  DismissalRequestStatus.READY,
];

export function presentRequestStatus(
  status: DismissalRequestStatus,
): PublicDismissalRequestStatus {
  return status.toLowerCase() as PublicDismissalRequestStatus;
}

export function parseActiveRequestStatus(
  value: unknown,
): DismissalRequestStatus | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DismissalRequestInvalidStatusFilterException();
  }

  const normalized = value.trim().toUpperCase();
  const candidate =
    normalized === 'AT_GATE'
      ? DismissalRequestStatus.AT_GATE
      : DismissalRequestStatus[
          normalized as keyof typeof DismissalRequestStatus
        ];

  if (!candidate || !ACTIVE_DISMISSAL_REQUEST_STATUSES.includes(candidate)) {
    throw new DismissalRequestInvalidStatusFilterException();
  }

  return candidate;
}

export function parseDismissalRequestTransitionTarget(
  value: unknown,
): DismissalRequestStatus {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DismissalRequestInvalidStatusException();
  }

  switch (value.trim().toLowerCase()) {
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
    case 'cancelled':
    case 'expired':
      throw new DismissalRequestTerminalStatusException();
    default:
      throw new DismissalRequestInvalidStatusException();
  }
}
