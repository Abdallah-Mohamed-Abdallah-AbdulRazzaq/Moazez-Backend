import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { CreateGradeAssessmentQuestionDto } from '../dto/grade-assessment-question.dto';
import { normalizeQuestionPayload } from '../domain/grade-question-domain';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import { presentGradeAssessmentQuestion } from '../presenters/grade-assessment-question.presenter';
import {
  assertQuestionMutationAllowed,
  buildQuestionAuditEntry,
  loadQuestionAssessmentOrThrow,
  resolveCreateQuestionPayload,
  summarizeQuestionForAudit,
} from './grade-assessment-question-use-case.helpers';

@Injectable()
export class CreateGradeAssessmentQuestionUseCase {
  constructor(
    private readonly questionsRepository: GradesAssessmentQuestionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
    command: CreateGradeAssessmentQuestionDto,
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

    const payload = await resolveCreateQuestionPayload({
      repository: this.questionsRepository,
      assessmentId: assessment.id,
      payload: normalizeQuestionPayload(command, {
        requirePrompt: true,
        requireType: true,
        requirePoints: true,
        defaultRequired: true,
      }),
    });

    const question = await this.questionsRepository.createQuestionWithOptions({
      schoolId: assessment.schoolId,
      assessmentId: assessment.id,
      type: payload.type,
      prompt: payload.prompt,
      promptAr: payload.promptAr,
      explanation: payload.explanation,
      explanationAr: payload.explanationAr,
      points: payload.points,
      sortOrder: payload.sortOrder,
      required: payload.required,
      answerKey: payload.answerKey,
      metadata: payload.metadata,
      options: payload.options ?? [],
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'grades.question.create',
        resourceType: 'grade_assessment_question',
        resourceId: question.id,
        after: summarizeQuestionForAudit(question),
      }),
    );

    return presentGradeAssessmentQuestion(question);
  }
}
