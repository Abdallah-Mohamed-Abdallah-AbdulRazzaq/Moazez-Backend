import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { ListGradeRulesQueryDto } from '../dto/list-grade-rules-query.dto';
import { GradesRulesRepository } from '../infrastructure/grades-rules.repository';
import { presentGradeRules } from '../presenters/grade-rule.presenter';
import { normalizeRuleListFilters } from './grade-rule-use-case.helpers';

@Injectable()
export class ListGradeRulesUseCase {
  constructor(private readonly gradesRulesRepository: GradesRulesRepository) {}

  async execute(query: ListGradeRulesQueryDto) {
    const scope = requireGradesScope();
    const rules = await this.gradesRulesRepository.listRules(
      normalizeRuleListFilters(query, scope.schoolId),
    );

    return presentGradeRules(rules);
  }
}
