import { DismissalGateOperationalStatus } from '@prisma/client';
import { DismissalInvalidStatusException } from './dismissal.errors';

export type PublicDismissalGateStatus =
  | 'open'
  | 'busy'
  | 'closed'
  | 'maintenance';

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
