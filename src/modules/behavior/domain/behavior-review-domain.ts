import { HttpStatus } from '@nestjs/common';
import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
} from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  BehaviorRecordAlreadyReviewedException,
  BehaviorRecordCancelledException,
  BehaviorRecordInvalidStatusTransitionException,
  BehaviorRecordPointsInvalidException,
  normalizeBehaviorRecordStatus,
  normalizeBehaviorRecordType,
  normalizeNullableText,
} from './behavior-records-domain';

export interface BehaviorReviewRecordState {
  id?: string;
  status: BehaviorRecordStatus | string;
}

export interface BehaviorReviewPointsInput {
  type: BehaviorRecordType | string;
  effectivePoints: number;
}

export interface BehaviorReviewReasonInput {
  type: BehaviorRecordType | string;
  titleEn?: string | null;
  titleAr?: string | null;
  reviewNoteEn?: string | null;
  reviewNoteAr?: string | null;
}

export interface BehaviorReviewQueueSummarizable {
  type: BehaviorRecordType | string;
  status: BehaviorRecordStatus | string;
}

export class BehaviorRecordNotSubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.record.not_submitted',
      message: 'Behavior record must be submitted first',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class BehaviorPointsDuplicateSourceException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'behavior.points.duplicate_source',
      message: 'Behavior points have already been recorded for source',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function assertBehaviorRecordReviewable(
  record: BehaviorReviewRecordState,
): void {
  const status = normalizeBehaviorRecordStatus(record.status);
  if (status === BehaviorRecordStatus.SUBMITTED) return;

  if (status === BehaviorRecordStatus.DRAFT) {
    throw new BehaviorRecordNotSubmittedException({
      recordId: record.id ?? null,
      status,
    });
  }

  if (isBehaviorReviewedStatus(status)) {
    throw new BehaviorRecordAlreadyReviewedException({
      recordId: record.id ?? null,
      status,
    });
  }

  if (status === BehaviorRecordStatus.CANCELLED) {
    throw new BehaviorRecordCancelledException({
      recordId: record.id ?? null,
      status,
    });
  }

  throw new BehaviorRecordInvalidStatusTransitionException({
    recordId: record.id ?? null,
    status,
    action: 'review',
  });
}

export function assertBehaviorRecordApprovable(
  record: BehaviorReviewRecordState,
): void {
  assertBehaviorRecordReviewable(record);
}

export function assertBehaviorRecordRejectable(
  record: BehaviorReviewRecordState,
): void {
  assertBehaviorRecordReviewable(record);
}

export function assertBehaviorApprovalPointsValid(
  input: BehaviorReviewPointsInput,
): void {
  const type = normalizeBehaviorRecordType(input.type);
  const points = Number(input.effectivePoints);

  if (!Number.isInteger(points)) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'pointsOverride',
      points: input.effectivePoints,
    });
  }

  if (type === BehaviorRecordType.POSITIVE && points < 0) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'pointsOverride',
      type,
      points,
      rule: 'positive_records_require_non_negative_points',
    });
  }

  if (type === BehaviorRecordType.NEGATIVE && points > 0) {
    throw new BehaviorRecordPointsInvalidException({
      field: 'pointsOverride',
      type,
      points,
      rule: 'negative_records_require_non_positive_points',
    });
  }
}

export function deriveBehaviorLedgerEntryType(
  type: BehaviorRecordType | string,
): BehaviorPointLedgerEntryType {
  return normalizeBehaviorRecordType(type) === BehaviorRecordType.POSITIVE
    ? BehaviorPointLedgerEntryType.AWARD
    : BehaviorPointLedgerEntryType.PENALTY;
}

export function deriveBehaviorEffectivePoints(input: {
  recordPoints: number;
  pointsOverride?: number | null;
}): number {
  return input.pointsOverride !== undefined && input.pointsOverride !== null
    ? Number(input.pointsOverride)
    : Number(input.recordPoints);
}

export function buildBehaviorLedgerReason(
  input: BehaviorReviewReasonInput,
): { reasonEn: string | null; reasonAr: string | null } {
  const reviewNoteEn = normalizeNullableText(input.reviewNoteEn);
  const reviewNoteAr = normalizeNullableText(input.reviewNoteAr);
  const titleEn = normalizeNullableText(input.titleEn);
  const titleAr = normalizeNullableText(input.titleAr);
  const type = normalizeBehaviorRecordType(input.type).toLowerCase();

  return {
    reasonEn:
      reviewNoteEn ??
      (titleEn ? `Approved behavior record: ${titleEn}` : `Approved ${type} behavior record`),
    reasonAr: reviewNoteAr ?? titleAr,
  };
}

export function summarizeBehaviorReviewQueue(
  records: BehaviorReviewQueueSummarizable[],
) {
  const summary = {
    total: records.length,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    positive: 0,
    negative: 0,
  };

  for (const record of records) {
    const status = normalizeBehaviorRecordStatus(record.status);
    const type = normalizeBehaviorRecordType(record.type);

    if (status === BehaviorRecordStatus.SUBMITTED) summary.submitted += 1;
    if (status === BehaviorRecordStatus.APPROVED) summary.approved += 1;
    if (status === BehaviorRecordStatus.REJECTED) summary.rejected += 1;
    if (status === BehaviorRecordStatus.CANCELLED) summary.cancelled += 1;
    if (type === BehaviorRecordType.POSITIVE) summary.positive += 1;
    if (type === BehaviorRecordType.NEGATIVE) summary.negative += 1;
  }

  return summary;
}

export function isBehaviorReviewedStatus(
  status: BehaviorRecordStatus | string,
): boolean {
  const normalized = normalizeBehaviorRecordStatus(status);
  return (
    normalized === BehaviorRecordStatus.APPROVED ||
    normalized === BehaviorRecordStatus.REJECTED
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
