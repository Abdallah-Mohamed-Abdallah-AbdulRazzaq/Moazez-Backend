import { Injectable } from '@nestjs/common';
import { hasGradeRichSelection } from '../infrastructure/grade-rich-content.projection';
import { requireGradesScope } from '../../grades-context';
import { assertSubmissionReviewable } from '../domain/grade-submission-review-domain';
import { BulkReviewGradeSubmissionAnswersDto } from '../dto/grade-submission-review.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentBulkReviewGradeSubmissionAnswers } from '../presenters/grade-submission.presenter';
import {
  findReviewSubmissionOrThrow,
  prepareBulkAnswerReviewInputs,
} from './grade-submission-review-use-case.helpers';

@Injectable()
export class BulkReviewGradeSubmissionAnswersUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
  ) {}

  async execute(
    submissionId: string,
    command: BulkReviewGradeSubmissionAnswersDto,
  ) {
    const scope = requireGradesScope();
    const submission = await findReviewSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionReviewable(submission);

    const { inputs } = await prepareBulkAnswerReviewInputs({
      repository: this.gradesSubmissionsRepository,
      submission,
      commands: command.reviews,
      actorId: scope.actorId,
    });
    const answers =
      await this.gradesSubmissionsRepository.bulkUpdateAnswerReviews(inputs);

    const displayQuestions = hasGradeRichSelection(
      answers.map((answer) => answer.question),
    )
      ? await this.gradesSubmissionsRepository.listActiveQuestionsForSubmission(
          submission.assessmentId,
          [...new Set(answers.map((answer) => answer.questionId))],
        )
      : [];
    return presentBulkReviewGradeSubmissionAnswers({
      submissionId: submission.id,
      answers,
      questions: displayQuestions,
    });
  }
}
