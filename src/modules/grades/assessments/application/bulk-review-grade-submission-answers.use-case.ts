import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { assertSubmissionReviewable } from '../domain/grade-submission-review-domain';
import { BulkReviewGradeSubmissionAnswersDto } from '../dto/grade-submission-review.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentBulkReviewGradeSubmissionAnswers } from '../presenters/grade-submission.presenter';
import {
  buildBulkAnswerReviewAuditEntry,
  findReviewSubmissionOrThrow,
  prepareBulkAnswerReviewInputs,
} from './grade-submission-review-use-case.helpers';

@Injectable()
export class BulkReviewGradeSubmissionAnswersUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
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

    const { inputs, answersBefore } = await prepareBulkAnswerReviewInputs({
      repository: this.gradesSubmissionsRepository,
      submission,
      commands: command.reviews,
      actorId: scope.actorId,
    });
    const answers =
      await this.gradesSubmissionsRepository.bulkUpdateAnswerReviews(inputs);

    await this.authRepository.createAuditLog(
      buildBulkAnswerReviewAuditEntry({
        scope,
        submission,
        answersBefore,
        answersAfter: answers,
      }),
    );

    return presentBulkReviewGradeSubmissionAnswers({
      submissionId: submission.id,
      answers,
    });
  }
}
