import { HttpStatus } from '@nestjs/common';
import { GradeItemStatus } from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export type GradeNumericValue =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

export class GradeItemScoreOutOfRangeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.item.out_of_range',
      message: 'Score is out of the allowed range',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function normalizeGradeItemStatus(
  input: GradeItemStatus | string | null | undefined,
): GradeItemStatus {
  const normalized = String(input ?? '').trim();

  switch (normalized.toUpperCase()) {
    case GradeItemStatus.ENTERED:
      return GradeItemStatus.ENTERED;
    case GradeItemStatus.MISSING:
      return GradeItemStatus.MISSING;
    case GradeItemStatus.ABSENT:
      return GradeItemStatus.ABSENT;
    default:
      throw new ValidationDomainException('Grade item status is invalid', {
        field: 'status',
        value: input,
      });
  }
}

export function validateScoreWithinRange(
  score: GradeNumericValue,
  maxScore: GradeNumericValue,
): void {
  const normalizedScore = toFiniteNumber(score, 'score');
  const normalizedMaxScore = toFiniteNumber(maxScore, 'maxScore');

  if (
    normalizedMaxScore < 0 ||
    normalizedScore < 0 ||
    normalizedScore > normalizedMaxScore
  ) {
    throw new GradeItemScoreOutOfRangeException({
      score: normalizedScore,
      maxScore: normalizedMaxScore,
    });
  }
}

export function validateGradeItemStatusAndScore(
  status: GradeItemStatus | string,
  score?: GradeNumericValue,
  maxScore?: GradeNumericValue,
): GradeItemStatus {
  const normalizedStatus = normalizeGradeItemStatus(status);

  if (normalizedStatus === GradeItemStatus.ENTERED && isScoreMissing(score)) {
    throw new ValidationDomainException('Entered grade items require a score', {
      status: normalizedStatus,
      field: 'score',
    });
  }

  if (!isScoreMissing(score) && !isScoreMissing(maxScore)) {
    validateScoreWithinRange(score, maxScore);
  }

  return normalizedStatus;
}

function isScoreMissing(value: GradeNumericValue): boolean {
  return value === undefined || value === null || value === '';
}

function toFiniteNumber(value: GradeNumericValue, field: string): number {
  if (isScoreMissing(value)) {
    throw new GradeItemScoreOutOfRangeException({ field });
  }

  const numberValue =
    typeof value === 'object' && value !== null && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new GradeItemScoreOutOfRangeException({ field, value });
  }

  return numberValue;
}
