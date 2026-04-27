import { Injectable } from '@nestjs/common';
import { GradeScopeType } from '@prisma/client';
import { requireGradesScope } from '../../grades-context';
import { GetEffectiveGradeRuleQueryDto } from '../dto/get-effective-grade-rule-query.dto';
import {
  GradeRuleEffectiveSource,
  resolveEffectiveRuleFallback,
} from '../domain/grade-rule-domain';
import { GradesRulesRepository } from '../infrastructure/grades-rules.repository';
import { presentEffectiveGradeRule } from '../presenters/grade-rule.presenter';
import {
  EffectiveRuleRequestScope,
  resolveAcademicYearId,
  resolveEffectiveRequestScope,
  validateAcademicRuleContext,
} from './grade-rule-use-case.helpers';

@Injectable()
export class GetEffectiveGradeRuleUseCase {
  constructor(private readonly gradesRulesRepository: GradesRulesRepository) {}

  async execute(query: GetEffectiveGradeRuleQueryDto) {
    const scope = requireGradesScope();
    const academicYearId = resolveAcademicYearId(query);
    await validateAcademicRuleContext(
      this.gradesRulesRepository,
      academicYearId,
      query.termId,
    );

    const requestedScope = await resolveEffectiveRequestScope(
      this.gradesRulesRepository,
      query,
      scope.schoolId,
    );

    const matched = await this.findEffectiveRule({
      academicYearId,
      termId: query.termId,
      schoolId: scope.schoolId,
      requestedScope,
    });

    if (!matched.rule) {
      return presentEffectiveGradeRule({
        source: 'DEFAULT',
        rule: null,
        requestedScope,
        resolvedFrom: requestedScope,
        fallback: resolveEffectiveRuleFallback(),
      });
    }

    return presentEffectiveGradeRule({
      source: matched.source,
      rule: matched.rule,
      requestedScope,
      resolvedFrom: requestedScope,
    });
  }

  private async findEffectiveRule(params: {
    academicYearId: string;
    termId: string;
    schoolId: string;
    requestedScope: EffectiveRuleRequestScope;
  }) {
    const stageRule =
      params.requestedScope.scopeType === GradeScopeType.STAGE
        ? await this.gradesRulesRepository.findRuleByUniqueScope({
            academicYearId: params.academicYearId,
            termId: params.termId,
            scopeType: GradeScopeType.STAGE,
            scopeKey: params.requestedScope.scopeKey,
          })
        : null;

    if (stageRule) {
      return {
        source: 'STAGE' as GradeRuleEffectiveSource,
        rule: stageRule,
      };
    }

    if (params.requestedScope.gradeId) {
      const gradeRule = await this.gradesRulesRepository.findGradeRule({
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: params.requestedScope.gradeId,
      });

      if (gradeRule) {
        return {
          source: 'GRADE' as GradeRuleEffectiveSource,
          rule: gradeRule,
        };
      }
    }

    const schoolRule = await this.gradesRulesRepository.findSchoolRule({
      academicYearId: params.academicYearId,
      termId: params.termId,
      schoolId: params.schoolId,
    });

    return {
      source: schoolRule
        ? ('SCHOOL' as GradeRuleEffectiveSource)
        : ('DEFAULT' as GradeRuleEffectiveSource),
      rule: schoolRule,
    };
  }
}
