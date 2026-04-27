import { HttpStatus } from '@nestjs/common';
import { GradeScopeType } from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export interface GradeScopeIds {
  schoolId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
}

export interface ResolveGradeScopeInput extends GradeScopeIds {
  scopeType?: GradeScopeType | string | null;
  scopeId?: string | null;
  scopeKey?: string | null;
}

export interface NormalizedGradeScope {
  scopeType: GradeScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface GradeScopeSpecificField {
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
}

export class GradeAssessmentInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.invalid_scope',
      message: 'Assessment scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export const SPRINT_4A_GRADE_SCOPE_TYPES: readonly GradeScopeType[] = [
  GradeScopeType.SCHOOL,
  GradeScopeType.STAGE,
  GradeScopeType.GRADE,
  GradeScopeType.SECTION,
  GradeScopeType.CLASSROOM,
] as const;

const GRADE_SCOPE_TYPE_ALIASES: Record<string, GradeScopeType> = {
  school: GradeScopeType.SCHOOL,
  stage: GradeScopeType.STAGE,
  grade: GradeScopeType.GRADE,
  section: GradeScopeType.SECTION,
  classroom: GradeScopeType.CLASSROOM,
};

export function normalizeGradeScopeType(
  input: GradeScopeType | string | null | undefined,
): GradeScopeType {
  const normalized = normalizeOptionalString(input);

  if (!normalized) {
    throw new GradeAssessmentInvalidScopeException({ field: 'scopeType' });
  }

  const alias = GRADE_SCOPE_TYPE_ALIASES[normalized.toLowerCase()];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as GradeScopeType;
  if (SPRINT_4A_GRADE_SCOPE_TYPES.includes(enumValue)) {
    return enumValue;
  }

  throw new GradeAssessmentInvalidScopeException({
    field: 'scopeType',
    value: input,
  });
}

export function resolveGradeScopeInput(
  input: ResolveGradeScopeInput,
): NormalizedGradeScope {
  const scopeType = normalizeGradeScopeType(input.scopeType);
  assertSupportedSprint4AScope(scopeType);

  const scopeKey = resolveScopeKey(scopeType, input);
  const specificField = getScopeSpecificField({ scopeType, scopeKey });

  return {
    scopeType,
    scopeKey,
    stageId: specificField.stageId ?? normalizeOptionalString(input.stageId),
    gradeId: specificField.gradeId ?? normalizeOptionalString(input.gradeId),
    sectionId:
      specificField.sectionId ?? normalizeOptionalString(input.sectionId),
    classroomId:
      specificField.classroomId ?? normalizeOptionalString(input.classroomId),
  };
}

export function getScopeSpecificField(
  scope: Pick<NormalizedGradeScope, 'scopeType' | 'scopeKey'>,
): GradeScopeSpecificField {
  switch (scope.scopeType) {
    case GradeScopeType.SCHOOL:
      return {};
    case GradeScopeType.STAGE:
      return { stageId: scope.scopeKey };
    case GradeScopeType.GRADE:
      return { gradeId: scope.scopeKey };
    case GradeScopeType.SECTION:
      return { sectionId: scope.scopeKey };
    case GradeScopeType.CLASSROOM:
      return { classroomId: scope.scopeKey };
  }
}

export function assertSupportedSprint4AScope(
  scopeType: GradeScopeType | string,
): GradeScopeType {
  const normalized = normalizeGradeScopeType(scopeType);

  if (!SPRINT_4A_GRADE_SCOPE_TYPES.includes(normalized)) {
    throw new GradeAssessmentInvalidScopeException({ scopeType });
  }

  return normalized;
}

export function mapScopeTypeToResponse(
  scopeType: GradeScopeType | string,
): string {
  return normalizeGradeScopeType(scopeType).toLowerCase();
}

function resolveScopeKey(
  scopeType: GradeScopeType,
  input: ResolveGradeScopeInput,
): string {
  switch (scopeType) {
    case GradeScopeType.SCHOOL:
      return (
        firstPresent(input.schoolId, input.scopeId, input.scopeKey) ?? 'school'
      );
    case GradeScopeType.STAGE:
      return requireScopeKey(scopeType, 'stageId', [
        input.stageId,
        input.scopeId,
        input.scopeKey,
      ]);
    case GradeScopeType.GRADE:
      return requireScopeKey(scopeType, 'gradeId', [
        input.gradeId,
        input.scopeId,
        input.scopeKey,
      ]);
    case GradeScopeType.SECTION:
      return requireScopeKey(scopeType, 'sectionId', [
        input.sectionId,
        input.scopeId,
        input.scopeKey,
      ]);
    case GradeScopeType.CLASSROOM:
      return requireScopeKey(scopeType, 'classroomId', [
        input.classroomId,
        input.scopeId,
        input.scopeKey,
      ]);
  }
}

function requireScopeKey(
  scopeType: GradeScopeType,
  field: keyof GradeScopeIds,
  candidates: Array<string | null | undefined>,
): string {
  const scopeKey = firstPresent(...candidates);

  if (!scopeKey) {
    throw new GradeAssessmentInvalidScopeException({ scopeType, field });
  }

  return scopeKey;
}

function firstPresent(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
