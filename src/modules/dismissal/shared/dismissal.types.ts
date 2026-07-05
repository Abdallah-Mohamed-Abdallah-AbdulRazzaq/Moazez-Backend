import {
  DismissalGateOperationalStatus,
  DismissalRequestStatus,
} from '@prisma/client';
import {
  DismissalInvalidStatusException,
  DismissalRequestInvalidStatusException,
  DismissalRequestInvalidStatusFilterException,
  DismissalRequestTerminalStatusException,
  DismissalWaitingStudentInvalidFilterException,
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

export type PublicDismissalWaitingStudentStatus = Extract<
  PublicDismissalRequestStatus,
  'called' | 'moving' | 'at_gate' | 'ready'
>;

export type PublicDismissalArrivalState =
  | 'called'
  | 'in_transit'
  | 'arrived'
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

export const WAITING_DISMISSAL_REQUEST_STATUSES: DismissalRequestStatus[] = [
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

export function parseWaitingRequestStatus(
  value: unknown,
): DismissalRequestStatus | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DismissalWaitingStudentInvalidFilterException();
  }

  const normalized = value.trim().toUpperCase();
  const candidate =
    normalized === 'AT_GATE'
      ? DismissalRequestStatus.AT_GATE
      : DismissalRequestStatus[
          normalized as keyof typeof DismissalRequestStatus
        ];

  if (!candidate || !WAITING_DISMISSAL_REQUEST_STATUSES.includes(candidate)) {
    throw new DismissalWaitingStudentInvalidFilterException();
  }

  return candidate;
}

export function presentArrivalState(
  status: DismissalRequestStatus,
): PublicDismissalArrivalState {
  switch (status) {
    case DismissalRequestStatus.CALLED:
      return 'called';
    case DismissalRequestStatus.MOVING:
      return 'in_transit';
    case DismissalRequestStatus.AT_GATE:
      return 'arrived';
    case DismissalRequestStatus.READY:
    default:
      return 'ready';
  }
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
