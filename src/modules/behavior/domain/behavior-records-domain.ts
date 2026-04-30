import { HttpStatus } from '@nestjs/common';
import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';

export interface BehaviorRecordCategoryDefaults {
  id?: string;
  type: BehaviorRecordType | string;
  defaultSeverity: BehaviorSeverity | string;
  defaultPoints: number;
  isActive: boolean;
}

export interface BehaviorRecordContentFields {
  titleEn?: string | null;
  titleAr?: string | null;
  noteEn?: string | null;
  noteAr?: string | null;
}

export interface BehaviorTermDateRange {
  id?: string;
  startDate: Date;
  endDate: Date;
}

export class BehaviorCategoryInactiveException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.category.inactive',
      message: 'Behavior category is inactive',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class BehaviorRecordInvalidStatusTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.invalid_status_transition',
      message: 'Behavior record status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class BehaviorRecordAlreadySubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.already_submitted',
      message: 'Behavior record is already submitted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class BehaviorRecordAlreadyReviewedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.already_reviewed',
      message: 'Behavior record is already reviewed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class BehaviorRecordCancelledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.cancelled',
      message: 'Behavior record is cancelled',
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

export class BehaviorRecordOutsideTermException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.outside_term',
      message: 'Behavior record date is outside the selected term',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class BehaviorScopeInvalidException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.scope.invalid',
      message: 'Behavior scope is invalid',
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

const BEHAVIOR_STATUS_ALIASES: Record<string, BehaviorRecordStatus> = {
  draft: BehaviorRecordStatus.DRAFT,
  submitted: BehaviorRecordStatus.SUBMITTED,
  approved: BehaviorRecordStatus.APPROVED,
  rejected: BehaviorRecordStatus.REJECTED,
  cancelled: BehaviorRecordStatus.CANCELLED,
};

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
    field: 'severity',
  });
}

export function normalizeBehaviorRecordStatus(
  input: BehaviorRecordStatus | string | null | undefined,
): BehaviorRecordStatus {
  return normalizeEnumValue({
    input,
    aliases: BEHAVIOR_STATUS_ALIASES,
    values: Object.values(BehaviorRecordStatus),
    field: 'status',
  });
}

export function assertBehaviorRecordContentPresent(
  input: BehaviorRecordContentFields,
): void {
  if (
    !normalizeNullableText(input.titleEn) &&
    !normalizeNullableText(input.titleAr) &&
    !normalizeNullableText(input.noteEn) &&
    !normalizeNullableText(input.noteAr)
  ) {
    throw new ValidationDomainException(
      'Behavior record title or note is required',
      {
        fields: ['titleEn', 'titleAr', 'noteEn', 'noteAr'],
      },
    );
  }
}

export function assertBehaviorRecordPointsCompatible(params: {
  type: BehaviorRecordType | string;
  points: number | null | undefined;
}): void {
  const type = normalizeBehaviorRecordType(params.type);
  const points = Number(params.points ?? 0);

  if (!Number.isInteger(points)) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'points',
      points: params.points,
    });
  }

  if (type === BehaviorRecordType.POSITIVE && points < 0) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'points',
      type,
      points,
      rule: 'positive_records_require_non_negative_points',
    });
  }

  if (type === BehaviorRecordType.NEGATIVE && points > 0) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'points',
      type,
      points,
      rule: 'negative_records_require_non_positive_points',
    });
  }
}

export function assertBehaviorRecordCategoryCompatible(params: {
  categoryType: BehaviorRecordType | string;
  recordType: BehaviorRecordType | string;
  categoryId?: string | null;
}): void {
  const categoryType = normalizeBehaviorRecordType(params.categoryType);
  const recordType = normalizeBehaviorRecordType(params.recordType);

  if (categoryType !== recordType) {
    throw new BehaviorRecordTypeMismatchException({
      categoryId: params.categoryId ?? null,
      categoryType,
      recordType,
    });
  }
}

export function assertBehaviorRecordCategoryActive(params: {
  category?: { id?: string; isActive: boolean } | null;
}): void {
  if (params.category && !params.category.isActive) {
    throw new BehaviorCategoryInactiveException({
      categoryId: params.category.id ?? null,
    });
  }
}

export function assertBehaviorRecordCanUpdate(
  status: BehaviorRecordStatus | string,
): void {
  const normalized = normalizeBehaviorRecordStatus(status);
  if (isBehaviorRecordDraft(normalized)) return;
  if (normalized === BehaviorRecordStatus.CANCELLED) {
    throw new BehaviorRecordCancelledException({ status: normalized });
  }
  if (isBehaviorRecordTerminalForTask4(normalized)) {
    throw new BehaviorRecordAlreadyReviewedException({ status: normalized });
  }

  throw new BehaviorRecordInvalidStatusTransitionException({
    status: normalized,
    action: 'update',
  });
}

export function assertBehaviorRecordCanSubmit(
  status: BehaviorRecordStatus | string,
): void {
  const normalized = normalizeBehaviorRecordStatus(status);
  if (isBehaviorRecordDraft(normalized)) return;
  if (isBehaviorRecordSubmitted(normalized)) {
    throw new BehaviorRecordAlreadySubmittedException({ status: normalized });
  }
  if (normalized === BehaviorRecordStatus.CANCELLED) {
    throw new BehaviorRecordCancelledException({ status: normalized });
  }
  if (isBehaviorRecordTerminalForTask4(normalized)) {
    throw new BehaviorRecordAlreadyReviewedException({ status: normalized });
  }

  throw new BehaviorRecordInvalidStatusTransitionException({
    status: normalized,
    action: 'submit',
  });
}

export function assertBehaviorRecordCanCancel(
  status: BehaviorRecordStatus | string,
): void {
  const normalized = normalizeBehaviorRecordStatus(status);
  if (
    normalized === BehaviorRecordStatus.DRAFT ||
    normalized === BehaviorRecordStatus.SUBMITTED
  ) {
    return;
  }
  if (normalized === BehaviorRecordStatus.CANCELLED) {
    throw new BehaviorRecordCancelledException({ status: normalized });
  }
  if (isBehaviorRecordTerminalForTask4(normalized)) {
    throw new BehaviorRecordAlreadyReviewedException({ status: normalized });
  }

  throw new BehaviorRecordInvalidStatusTransitionException({
    status: normalized,
    action: 'cancel',
  });
}

export function assertBehaviorOccurredAtInsideTerm(params: {
  occurredAt: Date;
  term?: BehaviorTermDateRange | null;
}): void {
  if (!params.term) return;

  const occurredAt = params.occurredAt.getTime();
  const start = startOfUtcDay(params.term.startDate).getTime();
  const end = endOfUtcDay(params.term.endDate).getTime();

  if (occurredAt < start || occurredAt > end) {
    throw new BehaviorRecordOutsideTermException({
      termId: params.term.id ?? null,
      occurredAt: params.occurredAt.toISOString(),
      startDate: params.term.startDate.toISOString(),
      endDate: params.term.endDate.toISOString(),
    });
  }
}

export function deriveBehaviorRecordDefaultsFromCategory(params: {
  category?: BehaviorRecordCategoryDefaults | null;
  type?: BehaviorRecordType | string | null;
  severity?: BehaviorSeverity | string | null;
  points?: number | null;
}): {
  type: BehaviorRecordType;
  severity: BehaviorSeverity;
  points: number;
} {
  const category = params.category ?? null;
  const type = params.type
    ? normalizeBehaviorRecordType(params.type)
    : category
      ? normalizeBehaviorRecordType(category.type)
      : undefined;

  if (!type) {
    throw new ValidationDomainException('Behavior record type is required', {
      field: 'type',
    });
  }

  if (category) {
    assertBehaviorRecordCategoryActive({ category });
    assertBehaviorRecordCategoryCompatible({
      categoryId: category.id,
      categoryType: category.type,
      recordType: type,
    });
  }

  return {
    type,
    severity: params.severity
      ? normalizeBehaviorSeverity(params.severity)
      : category
        ? normalizeBehaviorSeverity(category.defaultSeverity)
        : BehaviorSeverity.LOW,
    points:
      params.points !== undefined && params.points !== null
        ? Number(params.points)
        : (category?.defaultPoints ?? 0),
  };
}

export function isBehaviorRecordDraft(
  status: BehaviorRecordStatus | string,
): boolean {
  return normalizeBehaviorRecordStatus(status) === BehaviorRecordStatus.DRAFT;
}

export function isBehaviorRecordSubmitted(
  status: BehaviorRecordStatus | string,
): boolean {
  return (
    normalizeBehaviorRecordStatus(status) === BehaviorRecordStatus.SUBMITTED
  );
}

export function isBehaviorRecordTerminalForTask4(
  status: BehaviorRecordStatus | string,
): boolean {
  const normalized = normalizeBehaviorRecordStatus(status);
  return (
    normalized === BehaviorRecordStatus.APPROVED ||
    normalized === BehaviorRecordStatus.REJECTED
  );
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

export function parseBehaviorIsoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  return date;
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

function startOfUtcDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function endOfUtcDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
}
