import { HttpStatus } from '@nestjs/common';
import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export class RewardCatalogInvalidStatusTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.invalid_status_transition',
      message: 'Reward status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class RewardCatalogArchivedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.reward.archived',
      message: 'Reward catalog item is archived',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

const STATUS_ALIASES: Record<string, RewardCatalogItemStatus> = {
  draft: RewardCatalogItemStatus.DRAFT,
  published: RewardCatalogItemStatus.PUBLISHED,
  archived: RewardCatalogItemStatus.ARCHIVED,
};

const TYPE_ALIASES: Record<string, RewardCatalogItemType> = {
  physical: RewardCatalogItemType.PHYSICAL,
  digital: RewardCatalogItemType.DIGITAL,
  privilege: RewardCatalogItemType.PRIVILEGE,
  certificate: RewardCatalogItemType.CERTIFICATE,
  other: RewardCatalogItemType.OTHER,
};

export function normalizeRewardCatalogStatus(
  input: RewardCatalogItemStatus | string | null | undefined,
): RewardCatalogItemStatus {
  return normalizeEnumValue({
    input,
    aliases: STATUS_ALIASES,
    values: Object.values(RewardCatalogItemStatus),
    field: 'status',
  });
}

export function normalizeRewardCatalogType(
  input: RewardCatalogItemType | string | null | undefined,
): RewardCatalogItemType {
  return normalizeEnumValue({
    input,
    aliases: TYPE_ALIASES,
    values: Object.values(RewardCatalogItemType),
    fallback: RewardCatalogItemType.OTHER,
    field: 'type',
  });
}

export function assertRewardTitlePresent(input: {
  titleEn?: string | null;
  titleAr?: string | null;
}): void {
  if (!normalizeNullableText(input.titleEn) && !normalizeNullableText(input.titleAr)) {
    throw new ValidationDomainException('Reward title is required', {
      field: 'titleEn',
      aliases: ['titleAr'],
    });
  }
}

export function assertRewardStockValid(input: {
  isUnlimited?: boolean | null;
  stockQuantity?: number | null;
  stockRemaining?: number | null;
}): void {
  if (input.isUnlimited ?? true) return;

  if (input.stockQuantity === undefined || input.stockQuantity === null) {
    throw new ValidationDomainException('Reward stock quantity is required', {
      field: 'stockQuantity',
    });
  }
  if (input.stockRemaining === undefined || input.stockRemaining === null) {
    throw new ValidationDomainException('Reward stock remaining is required', {
      field: 'stockRemaining',
    });
  }

  assertNonNegativeInteger(input.stockQuantity, 'stockQuantity');
  assertNonNegativeInteger(input.stockRemaining, 'stockRemaining');

  if (input.stockRemaining > input.stockQuantity) {
    throw new ValidationDomainException(
      'Reward stock remaining cannot exceed stock quantity',
      {
        field: 'stockRemaining',
        stockQuantity: input.stockQuantity,
        stockRemaining: input.stockRemaining,
      },
    );
  }
}

export function assertRewardMinXpValid(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const minTotalXp = Number(value);
  if (!Number.isInteger(minTotalXp) || minTotalXp < 0) {
    throw new ValidationDomainException('Reward minimum XP is invalid', {
      field: 'minTotalXp',
      value,
    });
  }

  return minTotalXp;
}

export function assertRewardCatalogEditable(params: {
  item: { id: string; status: RewardCatalogItemStatus | string };
  protectedChangedFields?: string[];
}): void {
  const status = normalizeRewardCatalogStatus(params.item.status);
  if (status === RewardCatalogItemStatus.ARCHIVED) {
    throw new RewardCatalogArchivedException({ rewardId: params.item.id });
  }

  if (
    status === RewardCatalogItemStatus.PUBLISHED &&
    params.protectedChangedFields &&
    params.protectedChangedFields.length > 0
  ) {
    throw new RewardCatalogInvalidStatusTransitionException({
      rewardId: params.item.id,
      changedFields: params.protectedChangedFields,
    });
  }
}

export function assertRewardCatalogPublishable(item: {
  id: string;
  status: RewardCatalogItemStatus | string;
  titleEn?: string | null;
  titleAr?: string | null;
  minTotalXp?: number | null;
  isUnlimited?: boolean | null;
  stockQuantity?: number | null;
  stockRemaining?: number | null;
}): void {
  const status = normalizeRewardCatalogStatus(item.status);
  if (status === RewardCatalogItemStatus.ARCHIVED) {
    throw new RewardCatalogArchivedException({ rewardId: item.id });
  }
  if (status !== RewardCatalogItemStatus.DRAFT) {
    throw new RewardCatalogInvalidStatusTransitionException({
      rewardId: item.id,
      status,
      expected: RewardCatalogItemStatus.DRAFT,
    });
  }

  assertRewardTitlePresent(item);
  assertRewardMinXpValid(item.minTotalXp);
  assertRewardStockValid(item);
}

export function assertRewardCatalogArchivable(item: {
  id: string;
  status: RewardCatalogItemStatus | string;
}): void {
  if (normalizeRewardCatalogStatus(item.status) === RewardCatalogItemStatus.ARCHIVED) {
    throw new RewardCatalogArchivedException({ rewardId: item.id });
  }
}

export function isRewardCatalogAvailable(item: {
  status: RewardCatalogItemStatus | string;
  isUnlimited: boolean;
  stockRemaining?: number | null;
}): boolean {
  if (normalizeRewardCatalogStatus(item.status) !== RewardCatalogItemStatus.PUBLISHED) {
    return false;
  }

  if (item.isUnlimited) return true;
  return (item.stockRemaining ?? 0) > 0;
}

export function summarizeRewardCatalogAvailability(item: {
  status: RewardCatalogItemStatus | string;
  isUnlimited: boolean;
  stockQuantity?: number | null;
  stockRemaining?: number | null;
}) {
  return {
    isAvailable: isRewardCatalogAvailable(item),
    isUnlimited: item.isUnlimited,
    stockQuantity: item.stockQuantity ?? null,
    stockRemaining: item.stockRemaining ?? null,
  };
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function hasOwn<T extends object>(
  value: T,
  key: keyof T | string,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, key) &&
    (value as Record<string, unknown>)[String(key)] !== undefined
  );
}

function assertNonNegativeInteger(value: unknown, field: string): void {
  const asNumber = Number(value);
  if (!Number.isInteger(asNumber) || asNumber < 0) {
    throw new ValidationDomainException('Reward stock value is invalid', {
      field,
      value,
    });
  }
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  fallback?: TEnum;
  field: string;
}): TEnum {
  const normalized = normalizeNullableText(params.input);
  if (!normalized) {
    if (params.fallback) return params.fallback;
    throw new ValidationDomainException('Enum value is required', {
      field: params.field,
    });
  }

  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias = params.aliases[aliasKey] ?? params.aliases[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as TEnum;
  if (params.values.includes(enumValue)) return enumValue;

  throw new ValidationDomainException('Enum value is invalid', {
    field: params.field,
    value: params.input,
  });
}
