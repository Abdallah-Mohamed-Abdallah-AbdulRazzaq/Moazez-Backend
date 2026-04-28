import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { DeleteGradeAssessmentQuestionResponseDto } from '../dto/grade-assessment-question.dto';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import {
  assertQuestionMutationAllowed,
  buildQuestionAuditEntry,
  loadQuestionOrThrow,
  summarizeQuestionForAudit,
} from './grade-assessment-question-use-case.helpers';

@Injectable()
export class DeleteGradeAssessmentQuestionUseCase {
  constructor(
    private readonly questionsRepository: GradesAssessmentQuestionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    questionId: string,
  ): Promise<DeleteGradeAssessmentQuestionResponseDto> {
    const scope = requireGradesScope();
    const existing = await loadQuestionOrThrow(
      this.questionsRepository,
      questionId,
    );
    await assertQuestionMutationAllowed({
      repository: this.questionsRepository,
      assessment: existing.assessment,
    });

    const deletedAt = new Date().toISOString();
    await this.questionsRepository.softDeleteQuestionAndOptions({
      questionId: existing.id,
      assessmentId: existing.assessmentId,
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'grades.question.delete',
        resourceType: 'grade_assessment_question',
        resourceId: existing.id,
        before: summarizeQuestionForAudit(existing),
        after: { ...summarizeQuestionForAudit(existing), deletedAt },
      }),
    );

    return { ok: true };
  }
}
