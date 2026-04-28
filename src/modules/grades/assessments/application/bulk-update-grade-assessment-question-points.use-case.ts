import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { BulkUpdateGradeAssessmentQuestionPointsDto } from '../dto/grade-assessment-question.dto';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import { presentGradeAssessmentQuestions } from '../presenters/grade-assessment-question.presenter';
import {
  assertQuestionMutationAllowed,
  buildQuestionAuditEntry,
  loadQuestionAssessmentOrThrow,
  summarizeQuestionListForAudit,
  validateBulkPointsRequest,
} from './grade-assessment-question-use-case.helpers';

@Injectable()
export class BulkUpdateGradeAssessmentQuestionPointsUseCase {
  constructor(
    private readonly questionsRepository: GradesAssessmentQuestionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
    command: BulkUpdateGradeAssessmentQuestionPointsDto,
  ) {
    const scope = requireGradesScope();
    const assessment = await loadQuestionAssessmentOrThrow(
      this.questionsRepository,
      assessmentId,
    );
    await assertQuestionMutationAllowed({
      repository: this.questionsRepository,
      assessment,
    });

    const items = command.items ?? command.updates ?? [];
    if (items.length === 0) {
      throw new ValidationDomainException('Bulk points payload is required', {
        field: 'items',
        aliases: ['updates'],
      });
    }

    await validateBulkPointsRequest({
      repository: this.questionsRepository,
      assessmentId: assessment.id,
      items,
    });

    const before = await this.questionsRepository.listQuestions(assessment.id);
    const questions = await this.questionsRepository.bulkUpdateQuestionPoints({
      assessmentId: assessment.id,
      items,
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'grades.question.points.bulk_update',
        resourceType: 'grade_assessment',
        resourceId: assessment.id,
        before: summarizeQuestionListForAudit(before),
        after: summarizeQuestionListForAudit(questions),
      }),
    );

    return presentGradeAssessmentQuestions({ assessment, questions });
  }
}
