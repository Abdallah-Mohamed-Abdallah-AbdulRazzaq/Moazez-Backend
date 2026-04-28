import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import {
  assertAllRequiredAnswersReviewed,
  assertSubmissionFinalizable,
} from '../domain/grade-submission-review-domain';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionDetail } from '../presenters/grade-submission.presenter';
import {
  buildFinalizeSubmissionReviewAuditEntry,
  findReviewSubmissionOrThrow,
  prepareFinalizeSubmissionInput,
} from './grade-submission-review-use-case.helpers';

@Injectable()
export class FinalizeGradeSubmissionReviewUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
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

    await this.authRepository.createAuditLog(
      buildFinalizeSubmissionReviewAuditEntry({
        scope,
        before: submission,
        after: finalized,
      }),
    );

    return presentGradeSubmissionDetail({
      submission: finalized,
      questions,
    });
  }
}
