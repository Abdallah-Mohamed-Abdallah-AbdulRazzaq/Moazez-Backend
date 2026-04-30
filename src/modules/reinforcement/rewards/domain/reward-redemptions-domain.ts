import { HttpStatus } from '@nestjs/common';
import {
  RewardCatalogItemStatus,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export interface RewardRequestableCatalogItem {
  id: string;
  status: RewardCatalogItemStatus | string;
  deletedAt?: Date | string | null;
  isUnlimited: boolean;
  stockRemaining?: number | null;
  minTotalXp?: number | null;
}

export interface RewardEligibilitySnapshot extends Record<string, unknown> {
  minTotalXp: number | null;
  totalEarnedXp: number;
  eligible: boolean;
  stockAvailable: boolean;
  isUnlimited: boolean;
  stockRemaining: number | null;
  catalogItemStatus: string;
}

export class RewardNotPublishedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.not_published',
      message: 'Reward catalog item must be published first',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class RewardArchivedForRequestException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.archived',
      message: 'Reward catalog item is archived',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class RewardOutOfStockException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.out_of_stock',
      message: 'Reward catalog item is out of stock',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class RewardInsufficientXpException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.insufficient_xp',
      message: 'Student does not meet the XP eligibility requirement',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class RewardDuplicateRedemptionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.duplicate_redemption',
      message: 'Student already has an open redemption for this reward',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class RewardRedemptionTerminalException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.redemption.terminal',
      message: 'Reward redemption is already in a terminal state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class RewardRedemptionInvalidSourceException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.redemption.invalid_source',
      message: 'Reward redemption request source is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

const STATUS_ALIASES: Record<string, RewardRedemptionStatus> = {
  requested: RewardRedemptionStatus.REQUESTED,
  approved: RewardRedemptionStatus.APPROVED,
  rejected: RewardRedemptionStatus.REJECTED,
  fulfilled: RewardRedemptionStatus.FULFILLED,
  cancelled: RewardRedemptionStatus.CANCELLED,
  canceled: RewardRedemptionStatus.CANCELLED,
};

const REQUEST_SOURCE_ALIASES: Record<string, RewardRedemptionRequestSource> = {
  dashboard: RewardRedemptionRequestSource.DASHBOARD,
  teacher: RewardRedemptionRequestSource.TEACHER,
  student_app: RewardRedemptionRequestSource.STUDENT_APP,
  studentapp: RewardRedemptionRequestSource.STUDENT_APP,
  parent_app: RewardRedemptionRequestSource.PARENT_APP,
  parentapp: RewardRedemptionRequestSource.PARENT_APP,
  system: RewardRedemptionRequestSource.SYSTEM,
};

export function normalizeRewardRedemptionStatus(
  input: RewardRedemptionStatus | string | null | undefined,
): RewardRedemptionStatus {
  return normalizeEnumValue({
    input,
    aliases: STATUS_ALIASES,
    values: Object.values(RewardRedemptionStatus),
    field: 'status',
  });
}

export function normalizeRewardRedemptionRequestSource(
  input: RewardRedemptionRequestSource | string | null | undefined,
  fallback = RewardRedemptionRequestSource.DASHBOARD,
): RewardRedemptionRequestSource {
  const normalized = normalizeNullableText(input);
  if (!normalized) return fallback;

  return normalizeEnumValue({
    input: normalized,
    aliases: REQUEST_SOURCE_ALIASES,
    values: Object.values(RewardRedemptionRequestSource),
    field: 'requestSource',
    invalidException: (details) =>
      new RewardRedemptionInvalidSourceException(details),
  });
}

export function assertRewardRequestable(
  item: RewardRequestableCatalogItem,
): void {
  const status = normalizeCatalogStatus(item.status);

  if (item.deletedAt || status === RewardCatalogItemStatus.ARCHIVED) {
    throw new RewardArchivedForRequestException({ catalogItemId: item.id });
  }

  if (status !== RewardCatalogItemStatus.PUBLISHED) {
    throw new RewardNotPublishedException({
      catalogItemId: item.id,
      status,
    });
  }
}

export function assertRewardStockAvailableForRequest(
  item: Pick<
    RewardRequestableCatalogItem,
    'id' | 'isUnlimited' | 'stockRemaining'
  >,
): void {
  if (item.isUnlimited) return;

  if ((item.stockRemaining ?? 0) <= 0) {
    throw new RewardOutOfStockException({
      catalogItemId: item.id,
      stockRemaining: item.stockRemaining ?? null,
    });
  }
}

export function assertRewardEligibility(input: {
  catalogItemId?: string;
  studentId?: string;
  minTotalXp?: number | null;
  totalEarnedXp: number;
}): void {
  const minTotalXp = input.minTotalXp ?? null;
  if (minTotalXp === null) return;

  if (input.totalEarnedXp < minTotalXp) {
    throw new RewardInsufficientXpException({
      catalogItemId: input.catalogItemId,
      studentId: input.studentId,
      minTotalXp,
      totalEarnedXp: input.totalEarnedXp,
    });
  }
}

export function assertRedemptionCancellable(input: {
  id?: string;
  status: RewardRedemptionStatus | string;
}): void {
  const status = normalizeRewardRedemptionStatus(input.status);
  if (isRedemptionTerminal(status)) {
    throw new RewardRedemptionTerminalException({
      redemptionId: input.id,
      status,
    });
  }
}

export function isRedemptionOpen(
  status: RewardRedemptionStatus | string,
): boolean {
  const normalized = normalizeRewardRedemptionStatus(status);
  const openStatuses: RewardRedemptionStatus[] = [
    RewardRedemptionStatus.REQUESTED,
    RewardRedemptionStatus.APPROVED,
  ];
  return openStatuses.includes(normalized);
}

export function isRedemptionTerminal(
  status: RewardRedemptionStatus | string,
): boolean {
  const normalized = normalizeRewardRedemptionStatus(status);
  const terminalStatuses: RewardRedemptionStatus[] = [
    RewardRedemptionStatus.REJECTED,
    RewardRedemptionStatus.FULFILLED,
    RewardRedemptionStatus.CANCELLED,
  ];
  return terminalStatuses.includes(normalized);
}

export function buildEligibilitySnapshot(input: {
  catalogItemStatus: RewardCatalogItemStatus | string;
  minTotalXp?: number | null;
  totalEarnedXp: number;
  isUnlimited: boolean;
  stockRemaining?: number | null;
}): RewardEligibilitySnapshot {
  const minTotalXp = input.minTotalXp ?? null;
  const stockAvailable = input.isUnlimited || (input.stockRemaining ?? 0) > 0;
  const eligible = minTotalXp === null || input.totalEarnedXp >= minTotalXp;

  return {
    minTotalXp,
    totalEarnedXp: Math.max(0, input.totalEarnedXp),
    eligible,
    stockAvailable,
    isUnlimited: input.isUnlimited,
    stockRemaining: input.stockRemaining ?? null,
    catalogItemStatus: normalizeCatalogStatus(
      input.catalogItemStatus,
    ).toLowerCase(),
  };
}

export function summarizeRedemptionStatusCounts(
  counts: Partial<Record<RewardRedemptionStatus | string, number>>,
) {
  return {
    requested: getCount(counts, RewardRedemptionStatus.REQUESTED),
    approved: getCount(counts, RewardRedemptionStatus.APPROVED),
    rejected: getCount(counts, RewardRedemptionStatus.REJECTED),
    fulfilled: getCount(counts, RewardRedemptionStatus.FULFILLED),
    cancelled: getCount(counts, RewardRedemptionStatus.CANCELLED),
  };
}

export function assertRedemptionRequestedDateRange(input: {
  requestedFrom?: Date | null;
  requestedTo?: Date | null;
}): void {
  if (
    input.requestedFrom &&
    input.requestedTo &&
    input.requestedFrom.getTime() > input.requestedTo.getTime()
  ) {
    throw new ValidationDomainException('Requested date range is invalid', {
      field: 'requestedFrom',
      requestedFrom: input.requestedFrom.toISOString(),
      requestedTo: input.requestedTo.toISOString(),
    });
  }
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}

function normalizeCatalogStatus(
  input: RewardCatalogItemStatus | string | null | undefined,
): RewardCatalogItemStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      draft: RewardCatalogItemStatus.DRAFT,
      published: RewardCatalogItemStatus.PUBLISHED,
      archived: RewardCatalogItemStatus.ARCHIVED,
    },
    values: Object.values(RewardCatalogItemStatus),
    field: 'catalogItemStatus',
  });
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  field: string;
  invalidException?: (details: Record<string, unknown>) => DomainException;
}): TEnum {
  const normalized = normalizeNullableText(params.input);
  if (!normalized) {
    throw new ValidationDomainException('Enum value is required', {
      field: params.field,
    });
  }

  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias =
    params.aliases[aliasKey] ?? params.aliases[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as TEnum;
  if (params.values.includes(enumValue)) return enumValue;

  const details = { field: params.field, value: params.input };
  if (params.invalidException) throw params.invalidException(details);
  throw new ValidationDomainException('Enum value is invalid', details);
}

function getCount(
  counts: Partial<Record<RewardRedemptionStatus | string, number>>,
  status: RewardRedemptionStatus,
): number {
  return counts[status] ?? counts[status.toLowerCase()] ?? 0;
}
