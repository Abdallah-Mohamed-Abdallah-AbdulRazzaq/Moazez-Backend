import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import {
  assertAllRequiredAnswersReviewed,
  assertSubmissionFinalizable,
} from '../domain/grade-submission-review-domain';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionDetail } from '../presenters/grade-submission.presenter';
import {
  findReviewSubmissionOrThrow,
  prepareFinalizeSubmissionInput,
} from './grade-submission-review-use-case.helpers';

@Injectable()
export class FinalizeGradeSubmissionReviewUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
  ) {}

  async execute(submissionId: string) {
    const scope = requireGradesScope();
    const submission = await findReviewSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionFinalizable(submission);

    const questions =
      await this.gradesSubmissionsRepository.listActiveQuestionsForSubmission(
        submission.assessmentId,
      );
    assertAllRequiredAnswersReviewed({
      questions,
      answers: submission.answers,
    });

    const input = prepareFinalizeSubmissionInput({
      submission,
      questions,
      actorId: scope.actorId,
    });
    const finalized =
      await this.gradesSubmissionsRepository.finalizeSubmission(input);

    return presentGradeSubmissionDetail({
      submission: finalized,
      questions,
    });
  }
}
