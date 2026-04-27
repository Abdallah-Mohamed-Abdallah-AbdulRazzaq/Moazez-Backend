import {
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
} from '@prisma/client';
import {
  presentDecimal,
  presentGradeScopeType,
} from '../../shared/presenters/grades.presenter';
import {
  EffectiveGradeRuleResponseDto,
  GradeRulesListResponseDto,
  GradeRuleResponseDto,
} from '../dto/grade-rule-response.dto';
import {
  DEFAULT_EFFECTIVE_GRADE_RULE,
  GradeRuleEffectiveSource,
} from '../domain/grade-rule-domain';
import { EffectiveRuleRequestScope } from '../application/grade-rule-use-case.helpers';
import { GradeRuleRecord } from '../infrastructure/grades-rules.repository';

type EffectiveFallback = typeof DEFAULT_EFFECTIVE_GRADE_RULE;

export function presentGradeRule(rule: GradeRuleRecord): GradeRuleResponseDto {
  return {
    id: rule.id,
    academicYearId: rule.academicYearId,
    yearId: rule.academicYearId,
    termId: rule.termId,
    scopeType: presentGradeScopeType(rule.scopeType),
    scopeKey: rule.scopeKey,
    scopeId: rule.scopeKey,
    gradeId: rule.gradeId,
    gradingScale: presentGradeRuleScale(rule.gradingScale),
    passMark: presentDecimal(rule.passMark) ?? 0,
    rounding: presentGradeRoundingMode(rule.rounding),
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function presentGradeRules(
  rules: GradeRuleRecord[],
): GradeRulesListResponseDto {
  return {
    items: rules.map((rule) => presentGradeRule(rule)),
  };
}

export function presentEffectiveGradeRule(params: {
  source: GradeRuleEffectiveSource;
  rule: GradeRuleRecord | null;
  requestedScope: EffectiveRuleRequestScope;
  resolvedFrom: EffectiveRuleRequestScope;
  fallback?: EffectiveFallback;
}): EffectiveGradeRuleResponseDto {
  const fallback = params.fallback ?? DEFAULT_EFFECTIVE_GRADE_RULE;
  const scopeType = params.rule
    ? params.rule.scopeType
    : params.requestedScope.scopeType;
  const scopeKey = params.rule
    ? params.rule.scopeKey
    : params.requestedScope.scopeKey;

  return {
    source: params.source,
    id: params.rule?.id ?? null,
    ruleId: params.rule?.id ?? null,
    scopeType: presentGradeScopeType(scopeType),
    scopeKey,
    scopeId: scopeKey,
    gradeId: params.rule?.gradeId ?? params.resolvedFrom.gradeId,
    gradingScale: presentGradeRuleScale(
      params.rule?.gradingScale ?? fallback.gradingScale,
    ),
    passMark: params.rule
      ? (presentDecimal(params.rule.passMark) ?? fallback.passMark)
      : fallback.passMark,
    rounding: presentGradeRoundingMode(
      params.rule?.rounding ?? fallback.rounding,
    ),
    resolvedFrom: {
      requestedScopeType: presentGradeScopeType(
        params.requestedScope.scopeType,
      ),
      requestedScopeKey: params.requestedScope.scopeKey,
      stageId: params.resolvedFrom.stageId,
      gradeId: params.resolvedFrom.gradeId,
      sectionId: params.resolvedFrom.sectionId,
      classroomId: params.resolvedFrom.classroomId,
    },
  };
}

function presentGradeRuleScale(scale: GradeRuleScale | string): string {
  return String(scale).toLowerCase();
}

function presentGradeRoundingMode(
  rounding: GradeRoundingMode | string,
): string {
  return String(rounding).toLowerCase();
}
