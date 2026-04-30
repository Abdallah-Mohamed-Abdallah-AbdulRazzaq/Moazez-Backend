import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const CATALOG_STATUSES = Object.values(RewardCatalogItemStatus);
const CATALOG_TYPES = Object.values(RewardCatalogItemType);
const REDEMPTION_STATUSES = Object.values(RewardRedemptionStatus);
const LOW_STOCK_ABSOLUTE_THRESHOLD = 5;
const LOW_STOCK_RATIO_THRESHOLD = 0.2;

export interface RewardDashboardDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface RewardDashboardCatalogItemInput {
  id: string;
  titleEn?: string | null;
  titleAr?: string | null;
  type: RewardCatalogItemType | string;
  status: RewardCatalogItemStatus | string;
  minTotalXp?: number | null;
  isUnlimited: boolean;
  stockQuantity?: number | null;
  stockRemaining?: number | null;
  deletedAt?: Date | string | null;
  archivedAt?: Date | string | null;
}

export interface RewardDashboardRedemptionInput {
  id: string;
  catalogItemId: string;
  studentId?: string | null;
  status: RewardRedemptionStatus | string;
  requestedAt?: Date | string;
  catalogItem?: RewardDashboardCatalogItemInput | null;
}

export interface RewardAvailabilityState {
  isAvailable: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isUnlimited: boolean;
  stockQuantity: number | null;
  stockRemaining: number | null;
}

export interface RewardRedemptionStatusSummary {
  total: number;
  requested: number;
  approved: number;
  rejected: number;
  fulfilled: number;
  cancelled: number;
  open: number;
  terminal: number;
}

export interface RewardTopRequestedRow {
  catalogItemId: string;
  titleEn: string | null;
  titleAr: string | null;
  type: RewardCatalogItemType | string;
  status: RewardCatalogItemStatus | string;
  totalRequests: number;
  approved: number;
  fulfilled: number;
  rejected: number;
  cancelled: number;
}

export function assertValidRewardDashboardDateRange(
  range: RewardDashboardDateRange,
): void {
  if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo) {
    throw new ValidationDomainException(
      'Rewards dashboard date range start must be before or equal to end',
      {
        dateFrom: range.dateFrom.toISOString(),
        dateTo: range.dateTo.toISOString(),
      },
    );
  }
}

export function summarizeRewardCatalogStatuses(
  items: Array<{ status: RewardCatalogItemStatus | string }>,
) {
  const counts = new Map<RewardCatalogItemStatus, number>(
    CATALOG_STATUSES.map((status) => [status, 0]),
  );

  for (const item of items) {
    const status = normalizeCatalogStatus(item.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return {
    total: items.length,
    draft: counts.get(RewardCatalogItemStatus.DRAFT) ?? 0,
    published: counts.get(RewardCatalogItemStatus.PUBLISHED) ?? 0,
    archived: counts.get(RewardCatalogItemStatus.ARCHIVED) ?? 0,
  };
}

export function summarizeRewardCatalogTypes(
  items: Array<{ type: RewardCatalogItemType | string }>,
) {
  const counts = new Map<RewardCatalogItemType, number>(
    CATALOG_TYPES.map((type) => [type, 0]),
  );

  for (const item of items) {
    const type = normalizeCatalogType(item.type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return {
    physical: counts.get(RewardCatalogItemType.PHYSICAL) ?? 0,
    digital: counts.get(RewardCatalogItemType.DIGITAL) ?? 0,
    privilege: counts.get(RewardCatalogItemType.PRIVILEGE) ?? 0,
    certificate: counts.get(RewardCatalogItemType.CERTIFICATE) ?? 0,
    other: counts.get(RewardCatalogItemType.OTHER) ?? 0,
  };
}

export function summarizeRewardAvailability(
  items: RewardDashboardCatalogItemInput[],
) {
  const states = items.map((item) => deriveCatalogItemAvailability(item));

  return {
    unlimited: states.filter((state) => state.isUnlimited).length,
    limited: states.filter((state) => !state.isUnlimited).length,
    available: states.filter((state) => state.isAvailable).length,
    outOfStock: states.filter((state) => state.isOutOfStock).length,
    lowStock: states.filter((state) => state.isLowStock).length,
  };
}

export function summarizeRedemptionStatuses(
  redemptions: Array<{ status: RewardRedemptionStatus | string }>,
): RewardRedemptionStatusSummary {
  const counts = new Map<RewardRedemptionStatus, number>(
    REDEMPTION_STATUSES.map((status) => [status, 0]),
  );

  for (const redemption of redemptions) {
    const status = normalizeRedemptionStatus(redemption.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const requested = counts.get(RewardRedemptionStatus.REQUESTED) ?? 0;
  const approved = counts.get(RewardRedemptionStatus.APPROVED) ?? 0;
  const rejected = counts.get(RewardRedemptionStatus.REJECTED) ?? 0;
  const fulfilled = counts.get(RewardRedemptionStatus.FULFILLED) ?? 0;
  const cancelled = counts.get(RewardRedemptionStatus.CANCELLED) ?? 0;

  return {
    total: redemptions.length,
    requested,
    approved,
    rejected,
    fulfilled,
    cancelled,
    open: requested + approved,
    terminal: rejected + fulfilled + cancelled,
  };
}

export function calculateRewardFulfillmentRate(
  fulfilled: number,
  totalRedemptions: number,
): number {
  if (totalRedemptions <= 0) return 0;
  return round4(fulfilled / totalRedemptions);
}

export function calculateAverageEarnedXp(
  totalEarnedXp: number,
  studentsWithXp: number,
): number {
  if (studentsWithXp <= 0) return 0;
  return round2(totalEarnedXp / studentsWithXp);
}

export function buildTopRequestedRewards(
  redemptions: RewardDashboardRedemptionInput[],
  limit = 10,
): RewardTopRequestedRow[] {
  const rows = new Map<string, RewardTopRequestedRow>();

  for (const redemption of redemptions) {
    const catalogItem = redemption.catalogItem ?? null;
    const row = rows.get(redemption.catalogItemId) ?? {
      catalogItemId: redemption.catalogItemId,
      titleEn: catalogItem?.titleEn ?? null,
      titleAr: catalogItem?.titleAr ?? null,
      type: catalogItem?.type ?? RewardCatalogItemType.OTHER,
      status: catalogItem?.status ?? RewardCatalogItemStatus.DRAFT,
      totalRequests: 0,
      approved: 0,
      fulfilled: 0,
      rejected: 0,
      cancelled: 0,
    };

    row.totalRequests += 1;
    const status = normalizeRedemptionStatus(redemption.status);
    if (status === RewardRedemptionStatus.APPROVED) row.approved += 1;
    if (status === RewardRedemptionStatus.FULFILLED) row.fulfilled += 1;
    if (status === RewardRedemptionStatus.REJECTED) row.rejected += 1;
    if (status === RewardRedemptionStatus.CANCELLED) row.cancelled += 1;
    rows.set(redemption.catalogItemId, row);
  }

  return sortTopRequestedRewards([...rows.values()]).slice(0, limit);
}

export function sortTopRequestedRewards(
  rows: RewardTopRequestedRow[],
): RewardTopRequestedRow[] {
  return [...rows].sort((left, right) => {
    if (right.totalRequests !== left.totalRequests) {
      return right.totalRequests - left.totalRequests;
    }
    if (right.fulfilled !== left.fulfilled) {
      return right.fulfilled - left.fulfilled;
    }

    const leftTitle = (left.titleEn ?? left.titleAr ?? '').toLowerCase();
    const rightTitle = (right.titleEn ?? right.titleAr ?? '').toLowerCase();
    const titleCompare = leftTitle.localeCompare(rightTitle);
    return titleCompare !== 0
      ? titleCompare
      : left.catalogItemId.localeCompare(right.catalogItemId);
  });
}

export function deriveCatalogItemAvailability(
  item: RewardDashboardCatalogItemInput,
): RewardAvailabilityState {
  const status = normalizeCatalogStatus(item.status);
  const stockQuantity = item.stockQuantity ?? null;
  const stockRemaining = item.stockRemaining ?? null;
  const stockRemainingValue = stockRemaining ?? 0;
  const stockQuantityValue = stockQuantity ?? 0;
  const isDeleted = Boolean(item.deletedAt);
  const isArchived =
    status === RewardCatalogItemStatus.ARCHIVED || Boolean(item.archivedAt);
  const stockAvailable = item.isUnlimited || stockRemainingValue > 0;
  const isAvailable =
    status === RewardCatalogItemStatus.PUBLISHED &&
    !isDeleted &&
    !isArchived &&
    stockAvailable;
  const isOutOfStock = !item.isUnlimited && stockRemainingValue <= 0;
  const isLowStock =
    !item.isUnlimited &&
    stockRemainingValue > 0 &&
    (stockRemainingValue <= LOW_STOCK_ABSOLUTE_THRESHOLD ||
      (stockQuantityValue > 0 &&
        stockRemainingValue / stockQuantityValue <= LOW_STOCK_RATIO_THRESHOLD));

  return {
    isAvailable,
    isLowStock,
    isOutOfStock,
    isUnlimited: item.isUnlimited,
    stockQuantity,
    stockRemaining,
  };
}

export function deriveStudentRewardEligibility(input: {
  item: RewardDashboardCatalogItemInput;
  totalEarnedXp: number;
  openRedemption?: { id: string } | null;
  lastRedemption?: { status: RewardRedemptionStatus | string } | null;
}) {
  const minTotalXp = input.item.minTotalXp ?? 0;
  const availability = deriveCatalogItemAvailability(input.item);
  const hasEnoughXp = input.totalEarnedXp >= minTotalXp;
  const stockAvailable =
    input.item.isUnlimited || (input.item.stockRemaining ?? 0) > 0;
  const hasOpenRedemption = Boolean(input.openRedemption);

  return {
    catalogItemId: input.item.id,
    titleEn: input.item.titleEn ?? null,
    titleAr: input.item.titleAr ?? null,
    type: input.item.type,
    minTotalXp,
    totalEarnedXp: Math.max(0, input.totalEarnedXp),
    hasEnoughXp,
    stockAvailable,
    isEligible:
      availability.isAvailable &&
      hasEnoughXp &&
      stockAvailable &&
      !hasOpenRedemption,
    hasOpenRedemption,
    openRedemptionId: input.openRedemption?.id ?? null,
    lastRedemptionStatus: input.lastRedemption
      ? normalizeRedemptionStatus(input.lastRedemption.status).toLowerCase()
      : null,
  };
}

export function summarizeStudentRedemptions(
  redemptions: Array<{ status: RewardRedemptionStatus | string }>,
): RewardRedemptionStatusSummary {
  return summarizeRedemptionStatuses(redemptions);
}

export function sortLowStockRewards<T extends RewardDashboardCatalogItemInput>(
  items: T[],
): T[] {
  return [...items].sort((left, right) => {
    const leftRemaining = left.stockRemaining ?? Number.MAX_SAFE_INTEGER;
    const rightRemaining = right.stockRemaining ?? Number.MAX_SAFE_INTEGER;
    if (leftRemaining !== rightRemaining) return leftRemaining - rightRemaining;

    const leftTitle = (left.titleEn ?? left.titleAr ?? '').toLowerCase();
    const rightTitle = (right.titleEn ?? right.titleAr ?? '').toLowerCase();
    const titleCompare = leftTitle.localeCompare(rightTitle);
    return titleCompare !== 0 ? titleCompare : left.id.localeCompare(right.id);
  });
}

function normalizeCatalogStatus(
  input: RewardCatalogItemStatus | string,
): RewardCatalogItemStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      draft: RewardCatalogItemStatus.DRAFT,
      published: RewardCatalogItemStatus.PUBLISHED,
      archived: RewardCatalogItemStatus.ARCHIVED,
    },
    values: CATALOG_STATUSES,
    field: 'catalogStatus',
  });
}

function normalizeCatalogType(
  input: RewardCatalogItemType | string,
): RewardCatalogItemType {
  return normalizeEnumValue({
    input,
    aliases: {
      physical: RewardCatalogItemType.PHYSICAL,
      digital: RewardCatalogItemType.DIGITAL,
      privilege: RewardCatalogItemType.PRIVILEGE,
      certificate: RewardCatalogItemType.CERTIFICATE,
      other: RewardCatalogItemType.OTHER,
    },
    values: CATALOG_TYPES,
    field: 'catalogType',
  });
}

function normalizeRedemptionStatus(
  input: RewardRedemptionStatus | string,
): RewardRedemptionStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      requested: RewardRedemptionStatus.REQUESTED,
      approved: RewardRedemptionStatus.APPROVED,
      rejected: RewardRedemptionStatus.REJECTED,
      fulfilled: RewardRedemptionStatus.FULFILLED,
      cancelled: RewardRedemptionStatus.CANCELLED,
      canceled: RewardRedemptionStatus.CANCELLED,
    },
    values: REDEMPTION_STATUSES,
    field: 'redemptionStatus',
  });
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  field: string;
}): TEnum {
  const normalized =
    params.input === undefined || params.input === null
      ? ''
      : String(params.input).trim();
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

  throw new ValidationDomainException('Enum value is invalid', {
    field: params.field,
    value: params.input,
  });
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
