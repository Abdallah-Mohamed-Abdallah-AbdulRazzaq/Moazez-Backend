import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { assertSubmissionReviewable } from '../domain/grade-submission-review-domain';
import { ReviewGradeSubmissionAnswerDto } from '../dto/grade-submission-review.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionAnswer } from '../presenters/grade-submission.presenter';
import {
  buildSingleAnswerReviewAuditEntry,
  findReviewAnswerOrThrow,
  findReviewSubmissionOrThrow,
  prepareSingleAnswerReviewInput,
} from './grade-submission-review-use-case.helpers';

@Injectable()
export class ReviewGradeSubmissionAnswerUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    submissionId: string,
    answerId: string,
    command: ReviewGradeSubmissionAnswerDto,
  ) {
    const scope = requireGradesScope();
    const submission = await findReviewSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionReviewable(submission);

    const answer = await findReviewAnswerOrThrow(
      this.gradesSubmissionsRepository,
      answerId,
    );
    const input = await prepareSingleAnswerReviewInput({
      submission,
      answer,
      command,
      actorId: scope.actorId,
    });
    const updated =
      await this.gradesSubmissionsRepository.updateAnswerReview(input);

    await this.authRepository.createAuditLog(
      buildSingleAnswerReviewAuditEntry({
        scope,
        before: answer,
        after: updated,
      }),
    );

    return presentGradeSubmissionAnswer(updated);
  }
}
