import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { UpdateGradeRuleDto } from '../dto/update-grade-rule.dto';
import { assertWritableTerm } from '../domain/grade-rule-domain';
import { GradesRulesRepository } from '../infrastructure/grades-rules.repository';
import { presentGradeRule } from '../presenters/grade-rule.presenter';
import {
  buildRuleUpdateData,
  summarizeRuleForAudit,
} from './grade-rule-use-case.helpers';

@Injectable()
export class UpdateGradeRuleUseCase {
  constructor(
    private readonly gradesRulesRepository: GradesRulesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(ruleId: string, command: UpdateGradeRuleDto) {
    const scope = requireGradesScope();
    const existing = await this.gradesRulesRepository.findRuleById(ruleId);
    if (!existing) {
      throw new NotFoundDomainException('Grade rule not found', { ruleId });
    }

    const term = await this.gradesRulesRepository.findTerm(existing.termId);
    if (!term || term.academicYearId !== existing.academicYearId) {
      throw new NotFoundDomainException('Term not found', {
        termId: existing.termId,
        academicYearId: existing.academicYearId,
      });
    }
    assertWritableTerm(term);

    const updated = await this.gradesRulesRepository.updateRule(
      existing.id,
      buildRuleUpdateData(command),
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'grades',
      action: 'grades.rule.update',
      resourceType: 'grade_rule',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: summarizeRuleForAudit(existing),
      after: summarizeRuleForAudit(updated),
    });

    return presentGradeRule(updated);
  }
}
