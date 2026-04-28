import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { ReorderGradeAssessmentQuestionsDto } from '../dto/grade-assessment-question.dto';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import { presentGradeAssessmentQuestions } from '../presenters/grade-assessment-question.presenter';
import {
  assertQuestionMutationAllowed,
  buildQuestionAuditEntry,
  loadQuestionAssessmentOrThrow,
  summarizeQuestionListForAudit,
  validateReorderRequest,
} from './grade-assessment-question-use-case.helpers';

@Injectable()
export class ReorderGradeAssessmentQuestionsUseCase {
  constructor(
    private readonly questionsRepository: GradesAssessmentQuestionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
    command: ReorderGradeAssessmentQuestionsDto,
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

    const before = await this.questionsRepository.listQuestions(assessment.id);
    await validateReorderRequest({
      repository: this.questionsRepository,
      assessmentId: assessment.id,
      questionIds: command.questionIds,
      activeQuestions: before,
    });

    const questions = await this.questionsRepository.reorderQuestions({
      assessmentId: assessment.id,
      questionIds: command.questionIds,
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'grades.question.reorder',
        resourceType: 'grade_assessment',
        resourceId: assessment.id,
        before: summarizeQuestionListForAudit(before),
        after: summarizeQuestionListForAudit(questions),
      }),
    );

    return presentGradeAssessmentQuestions({ assessment, questions });
  }
}
