import { HttpStatus } from '@nestjs/common';
import { BehaviorRecordType, BehaviorSeverity } from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';

export interface BehaviorCategoryUsage {
  recordsCount: number;
  pointLedgerEntriesCount: number;
}

export class BehaviorCategoryInUseException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.category.in_use',
      message: 'Behavior category is in use',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class BehaviorRecordPointsInvalidException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.points_invalid',
      message: 'Behavior record points are invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class BehaviorRecordTypeMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.type_mismatch',
      message: 'Behavior record type does not match its category',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

const BEHAVIOR_TYPE_ALIASES: Record<string, BehaviorRecordType> = {
  positive: BehaviorRecordType.POSITIVE,
  negative: BehaviorRecordType.NEGATIVE,
};

const BEHAVIOR_SEVERITY_ALIASES: Record<string, BehaviorSeverity> = {
  low: BehaviorSeverity.LOW,
  medium: BehaviorSeverity.MEDIUM,
  high: BehaviorSeverity.HIGH,
  critical: BehaviorSeverity.CRITICAL,
};

const BEHAVIOR_CATEGORY_CODE_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const BEHAVIOR_CATEGORY_CODE_MAX_LENGTH = 100;

export function normalizeBehaviorRecordType(
  input: BehaviorRecordType | string | null | undefined,
): BehaviorRecordType {
  return normalizeEnumValue({
    input,
    aliases: BEHAVIOR_TYPE_ALIASES,
    values: Object.values(BehaviorRecordType),
    field: 'type',
  });
}

export function normalizeBehaviorSeverity(
  input: BehaviorSeverity | string | null | undefined,
  fallback = BehaviorSeverity.LOW,
): BehaviorSeverity {
  return normalizeEnumValue({
    input,
    aliases: BEHAVIOR_SEVERITY_ALIASES,
    values: Object.values(BehaviorSeverity),
    fallback,
    field: 'defaultSeverity',
  });
}

export function normalizeBehaviorCategoryCode(value: unknown): string {
  const raw = normalizeNullableText(value);
  if (!raw) {
    throw new ValidationDomainException('Behavior category code is required', {
      field: 'code',
    });
  }

  const code = raw
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();

  if (
    !code ||
    code.length > BEHAVIOR_CATEGORY_CODE_MAX_LENGTH ||
    !BEHAVIOR_CATEGORY_CODE_PATTERN.test(code)
  ) {
    throw new ValidationDomainException('Behavior category code is invalid', {
      field: 'code',
      pattern: BEHAVIOR_CATEGORY_CODE_PATTERN.source,
      maxLength: BEHAVIOR_CATEGORY_CODE_MAX_LENGTH,
    });
  }

  return code;
}

export function assertBehaviorCategoryNamePresent(input: {
  nameEn?: string | null;
  nameAr?: string | null;
}): void {
  if (
    !normalizeNullableText(input.nameEn) &&
    !normalizeNullableText(input.nameAr)
  ) {
    throw new ValidationDomainException('Behavior category name is required', {
      field: 'nameEn',
      aliases: ['nameAr'],
    });
  }
}

export function assertBehaviorCategoryPointsCompatible(input: {
  type: BehaviorRecordType | string;
  defaultPoints?: number | null;
}): void {
  const type = normalizeBehaviorRecordType(input.type);
  const defaultPoints = Number(input.defaultPoints ?? 0);

  if (!Number.isInteger(defaultPoints)) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'defaultPoints',
      defaultPoints: input.defaultPoints,
    });
  }

  if (isPositiveBehaviorType(type) && defaultPoints < 0) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'defaultPoints',
      type,
      defaultPoints,
      rule: 'positive_categories_require_non_negative_points',
    });
  }

  if (isNegativeBehaviorType(type) && defaultPoints > 0) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'defaultPoints',
      type,
      defaultPoints,
      rule: 'negative_categories_require_non_positive_points',
    });
  }
}

export function assertBehaviorCategoryCanChangeIdentity(params: {
  categoryId: string;
  usage: BehaviorCategoryUsage;
  changedFields: string[];
}): void {
  if (
    params.changedFields.length === 0 ||
    !isBehaviorCategoryInUse(params.usage)
  ) {
    return;
  }

  throw new BehaviorCategoryInUseException({
    categoryId: params.categoryId,
    changedFields: params.changedFields,
    recordsCount: params.usage.recordsCount,
    pointLedgerEntriesCount: params.usage.pointLedgerEntriesCount,
  });
}

export function assertBehaviorCategoryCanDelete(params: {
  categoryId: string;
  usage: BehaviorCategoryUsage;
}): void {
  if (!isBehaviorCategoryInUse(params.usage)) return;

  throw new BehaviorCategoryInUseException({
    categoryId: params.categoryId,
    recordsCount: params.usage.recordsCount,
    pointLedgerEntriesCount: params.usage.pointLedgerEntriesCount,
  });
}

export function isPositiveBehaviorType(
  type: BehaviorRecordType | string,
): boolean {
  return normalizeBehaviorRecordType(type) === BehaviorRecordType.POSITIVE;
}

export function isNegativeBehaviorType(
  type: BehaviorRecordType | string,
): boolean {
  return normalizeBehaviorRecordType(type) === BehaviorRecordType.NEGATIVE;
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

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}

function isBehaviorCategoryInUse(usage: BehaviorCategoryUsage): boolean {
  return usage.recordsCount > 0 || usage.pointLedgerEntriesCount > 0;
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
