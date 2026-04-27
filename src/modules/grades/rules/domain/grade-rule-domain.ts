import { HttpStatus } from '@nestjs/common';
import {
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeAssessmentInvalidScopeException,
  normalizeGradeScopeType,
} from '../../shared/domain/grade-scope';
import { GradeTermClosedException } from '../../shared/domain/grade-workflow';

export interface GradeRuleWritableTermLike {
  id?: string;
  isActive?: boolean | null;
}

export interface GradeRuleWriteScopeInput {
  schoolId: string;
  scopeType?: GradeScopeType | string | null;
  scopeId?: string | null;
  gradeId?: string | null;
}

export interface NormalizedGradeRuleWriteScope {
  scopeType: GradeScopeType;
  scopeKey: string;
  gradeId: string | null;
}

export type GradeRuleEffectiveSource = 'DEFAULT' | 'SCHOOL' | 'GRADE' | 'STAGE';

export const DEFAULT_EFFECTIVE_GRADE_RULE = {
  source: 'DEFAULT' as const,
  gradingScale: GradeRuleScale.PERCENTAGE,
  passMark: 50,
  rounding: GradeRoundingMode.DECIMAL_2,
};

export class GradeRuleConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.rule.conflict',
      message: 'A grading rule already exists for this scope',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === 'P2002';
}

export function assertWritableTerm(termLike: GradeRuleWritableTermLike): void {
  if (!termLike.isActive) {
    throw new GradeTermClosedException({ termId: termLike.id });
  }
}

export function assertRuleWriteScopeAllowed(
  scopeType: GradeScopeType | string | null | undefined,
): GradeScopeType {
  const normalized = normalizeGradeScopeType(scopeType);
  if (
    normalized !== GradeScopeType.SCHOOL &&
    normalized !== GradeScopeType.GRADE
  ) {
    throw new GradeAssessmentInvalidScopeException({
      scopeType: normalized,
      allowedWriteScopes: [GradeScopeType.SCHOOL, GradeScopeType.GRADE],
    });
  }

  return normalized;
}

export function normalizeRuleScopeForWrite(
  input: GradeRuleWriteScopeInput,
): NormalizedGradeRuleWriteScope {
  const scopeType = assertRuleWriteScopeAllowed(input.scopeType ?? null);

  if (scopeType === GradeScopeType.SCHOOL) {
    return {
      scopeType,
      scopeKey: input.schoolId,
      gradeId: null,
    };
  }

  const gradeId = firstPresent(input.gradeId, input.scopeId);
  if (!gradeId) {
    throw new GradeAssessmentInvalidScopeException({
      scopeType,
      field: 'gradeId',
    });
  }

  return {
    scopeType,
    scopeKey: gradeId,
    gradeId,
  };
}

export function validatePassMark(value: unknown): number {
  const passMark = Number(value);
  if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
    throw new ValidationDomainException('Pass mark must be between 0 and 100', {
      field: 'passMark',
      value,
    });
  }

  return passMark;
}

export function normalizeGradeRuleScale(
  input?: GradeRuleScale | string | null,
): GradeRuleScale {
  const value = String(input ?? GradeRuleScale.PERCENTAGE)
    .trim()
    .toUpperCase();

  if (value === GradeRuleScale.PERCENTAGE) {
    return GradeRuleScale.PERCENTAGE;
  }

  throw new ValidationDomainException('Grading scale is invalid', {
    field: 'gradingScale',
    value: input,
  });
}

export function normalizeGradeRoundingMode(
  input?: GradeRoundingMode | string | null,
): GradeRoundingMode {
  const value = String(input ?? GradeRoundingMode.DECIMAL_2)
    .trim()
    .toUpperCase();

  switch (value) {
    case GradeRoundingMode.NONE:
      return GradeRoundingMode.NONE;
    case GradeRoundingMode.DECIMAL_0:
      return GradeRoundingMode.DECIMAL_0;
    case GradeRoundingMode.DECIMAL_1:
      return GradeRoundingMode.DECIMAL_1;
    case GradeRoundingMode.DECIMAL_2:
      return GradeRoundingMode.DECIMAL_2;
    default:
      throw new ValidationDomainException('Grade rounding mode is invalid', {
        field: 'rounding',
        value: input,
      });
  }
}

export function resolveEffectiveRuleFallback(): typeof DEFAULT_EFFECTIVE_GRADE_RULE {
  return DEFAULT_EFFECTIVE_GRADE_RULE;
}

function firstPresent(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }

  return null;
}
