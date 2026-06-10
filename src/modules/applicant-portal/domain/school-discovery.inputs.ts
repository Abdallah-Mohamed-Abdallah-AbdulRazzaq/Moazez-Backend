import { ValidationDomainException } from '../../../common/exceptions/domain-exception';

export interface NormalizedSchoolDiscoveryQuery {
  search?: string;
  city?: string;
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function normalizeSchoolDiscoveryQuery(input?: {
  search?: string;
  city?: string;
  page?: number;
  limit?: number;
}): NormalizedSchoolDiscoveryQuery {
  return {
    search: normalizeOptionalDiscoveryText(input?.search, 'search', 100),
    city: normalizeOptionalDiscoveryText(input?.city, 'city', 120),
    page: normalizePositiveInteger(input?.page, 'page', DEFAULT_PAGE),
    limit: Math.min(
      normalizePositiveInteger(input?.limit, 'limit', DEFAULT_LIMIT),
      MAX_LIMIT,
    ),
  };
}

function normalizeOptionalDiscoveryText(
  value: string | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      maxLength,
    });
  }

  return normalized;
}

function normalizePositiveInteger(
  value: number | undefined,
  field: string,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;

  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      minimum: 1,
    });
  }

  return value;
}
