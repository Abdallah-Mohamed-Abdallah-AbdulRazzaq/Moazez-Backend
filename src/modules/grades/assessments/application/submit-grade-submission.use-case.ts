import { Injectable } from '@nestjs/common';
import { gradeAnswerNullFact } from '../infrastructure/grade-typed-answer.projection';
import { isGradeEvaluationType } from '../domain/grade-question-evaluation';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import {
  assertRequiredQuestionsAnswered,
  assertSubmissionAssessmentAcceptsDrafts,
  assertSubmissionSubmittable,
  normalizeAnswerPayload,
  validateAnswerPayloadForQuestion,
  validateStoredAnswerPayloadForQuestion,
  validateSelectedOptionsForQuestion,
} from '../domain/grade-submission-domain';
import {
  GradeSubmissionAnswerRecord,
  GradeSubmissionQuestionRecord,
  GradesSubmissionsRepository,
} from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionDetail } from '../presenters/grade-submission.presenter';
import {
  buildSubmissionAuditEntry,
  findSubmissionDetailOrThrow,
  listQuestionsForSubmissionOrThrow,
} from './grade-submission-use-case.helpers';

@Injectable()
export class SubmitGradeSubmissionUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(submissionId: string) {
    const scope = requireGradesScope();
    const submission = await findSubmissionDetailOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionSubmittable(submission);
    assertSubmissionAssessmentAcceptsDrafts(
      submission.assessment,
      submission.assessment.term,
    );

    const questions = await listQuestionsForSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      submission.assessmentId,
    );
    validateSavedAnswersBeforeSubmit({
      questions: questions.filter((q) => q.responseConfig == null),
      answers: submission.answers,
    });
    assertRequiredQuestionsAnswered({
      questions,
      answers: submission.answers,
    });

    const previousStatus = submission.status;
    const submitted = await this.gradesSubmissionsRepository.submitSubmission(
      submission.id,
    );

    await this.authRepository.createAuditLog(
      buildSubmissionAuditEntry({
        scope,
        action: 'grades.submission.submit',
        submission: submitted,
        beforeStatus: previousStatus,
        afterMetadata: { previousStatus },
      }),
    );

    return presentGradeSubmissionDetail({ submission: submitted, questions });
  }
}

function validateSavedAnswersBeforeSubmit(params: {
  questions: GradeSubmissionQuestionRecord[];
  answers: GradeSubmissionAnswerRecord[];
}): void {
  const questionById = new Map(
    params.questions.map((question) => [question.id, question]),
  );

  for (const answer of params.answers) {
    const question = questionById.get(answer.questionId);
    if (!question || question.responseConfig != null) continue;

    const payload = normalizeAnswerPayload({
      answerText: answer.answerText,
      answerJson: answer.answerJson ?? null,
      selectedOptionIds: answer.selectedOptions.map(
        (selected) => selected.optionId,
      ),
    });

    if (isGradeEvaluationType(question.type))
      validateStoredAnswerPayloadForQuestion({
        question,
        payload: { ...payload, answerJsonSqlNull: gradeAnswerNullFact(answer) },
      });
    else validateAnswerPayloadForQuestion({ question, payload });
    validateSelectedOptionsForQuestion({
      question,
      selectedOptionIds: payload.selectedOptionIds,
      options: question.options,
    });
  }
}
