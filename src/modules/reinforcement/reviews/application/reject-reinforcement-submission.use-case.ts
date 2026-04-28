import { Injectable } from '@nestjs/common';
import { ReinforcementReviewOutcome } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertReviewNoteForRejection,
  assertSubmissionReviewable,
} from '../domain/reinforcement-review-domain';
import { ReviewReinforcementSubmissionDto } from '../dto/reinforcement-review.dto';
import { ReinforcementReviewsRepository } from '../infrastructure/reinforcement-reviews.repository';
import { presentReinforcementReviewItemDetail } from '../presenters/reinforcement-review.presenter';
import {
  buildRejectedAssignmentUpdate,
  buildReviewAuditEntry,
  findReviewItemOrThrow,
  normalizeReviewNotes,
} from './reinforcement-review-use-case.helpers';

@Injectable()
export class RejectReinforcementSubmissionUseCase {
  constructor(
    private readonly reviewsRepository: ReinforcementReviewsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    submissionId: string,
    command: ReviewReinforcementSubmissionDto,
  ) {
    const scope = requireReinforcementScope();
    const submission = await findReviewItemOrThrow(
      this.reviewsRepository,
      submissionId,
    );
    assertSubmissionReviewable(submission);

    const notes = normalizeReviewNotes(command);
    assertReviewNoteForRejection(notes);

    const assignmentUpdate = await buildRejectedAssignmentUpdate({
      repository: this.reviewsRepository,
      submission,
    });
    const reviewed =
      await this.reviewsRepository.rejectSubmissionWithReview({
        schoolId: scope.schoolId,
        submission,
        reviewedById: scope.actorId,
        reviewedAt: new Date(),
        note: notes.note,
        noteAr: notes.noteAr,
        assignmentStatus: assignmentUpdate.status,
        assignmentProgress: assignmentUpdate.progress,
        assignmentCompletedAt: null,
      });

    await this.authRepository.createAuditLog(
      buildReviewAuditEntry({
        scope,
        action: 'reinforcement.review.reject',
        outcome: ReinforcementReviewOutcome.REJECTED,
        before: submission,
        after: reviewed,
      }),
    );

    return presentReinforcementReviewItemDetail(reviewed);
  }
}
