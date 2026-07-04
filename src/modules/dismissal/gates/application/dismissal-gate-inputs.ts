import {
  DismissalInvalidGateCoordinatesException,
  DismissalInvalidWaitingZonesException,
} from '../../shared/dismissal.errors';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const MAX_WAITING_ZONES = 20;
const MAX_WAITING_ZONE_LENGTH = 80;

export function normalizeRequiredText(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new ValidationDomainException();
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new ValidationDomainException();
  }

  return trimmed;
}

export function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ValidationDomainException();
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
}

export function normalizeWaitingZones(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new DismissalInvalidWaitingZonesException();
  }

  const zones = value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new DismissalInvalidWaitingZonesException();
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);

  if (
    zones.length > MAX_WAITING_ZONES ||
    zones.some((item) => item.length > MAX_WAITING_ZONE_LENGTH)
  ) {
    throw new DismissalInvalidWaitingZonesException();
  }

  return [...new Set(zones)];
}

export function validateGateCoordinates(params: {
  latitude?: number | null;
  longitude?: number | null;
}): void {
  if (
    params.latitude !== undefined &&
    params.latitude !== null &&
    !isLatitude(params.latitude)
  ) {
    throw new DismissalInvalidGateCoordinatesException();
  }
  if (
    params.longitude !== undefined &&
    params.longitude !== null &&
    !isLongitude(params.longitude)
  ) {
    throw new DismissalInvalidGateCoordinatesException();
  }
}

function isLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
