import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { UpsertGradeRuleDto } from '../dto/upsert-grade-rule.dto';
import {
  GradeRuleConflictException,
  isUniqueConstraintError,
} from '../domain/grade-rule-domain';
import { GradesRulesRepository } from '../infrastructure/grades-rules.repository';
import { presentGradeRule } from '../presenters/grade-rule.presenter';
import {
  buildRuleCreateData,
  summarizeRuleForAudit,
} from './grade-rule-use-case.helpers';

@Injectable()
export class UpsertGradeRuleUseCase {
  constructor(
    private readonly gradesRulesRepository: GradesRulesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: UpsertGradeRuleDto) {
    const scope = requireGradesScope();
    const data = await buildRuleCreateData(this.gradesRulesRepository, command);

    try {
      const result = await this.gradesRulesRepository.upsertRule(data);
      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'grades',
        action:
          result.operation === 'create'
            ? 'grades.rule.create'
            : 'grades.rule.update',
        resourceType: 'grade_rule',
        resourceId: result.rule.id,
        outcome: AuditOutcome.SUCCESS,
        before: result.previous
          ? summarizeRuleForAudit(result.previous)
          : undefined,
        after: summarizeRuleForAudit(result.rule),
      });

      return presentGradeRule(result.rule);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new GradeRuleConflictException({
          academicYearId: String(data.academicYearId),
          termId: String(data.termId),
          scopeType: data.scopeType,
          scopeKey: String(data.scopeKey),
        });
      }

      throw error;
    }
  }
}
