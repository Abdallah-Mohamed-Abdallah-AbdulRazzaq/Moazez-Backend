import { Injectable } from '@nestjs/common';
import { ReinforcementReviewOutcome } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { assertSubmissionReviewable } from '../domain/reinforcement-review-domain';
import { ReviewReinforcementSubmissionDto } from '../dto/reinforcement-review.dto';
import { ReinforcementReviewsRepository } from '../infrastructure/reinforcement-reviews.repository';
import { presentReinforcementReviewItemDetail } from '../presenters/reinforcement-review.presenter';
import {
  buildApprovedAssignmentUpdate,
  buildReviewAuditEntry,
  findReviewItemOrThrow,
  normalizeReviewNotes,
} from './reinforcement-review-use-case.helpers';

@Injectable()
export class ApproveReinforcementSubmissionUseCase {
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

    const now = new Date();
    const assignmentUpdate = await buildApprovedAssignmentUpdate({
      repository: this.reviewsRepository,
      submission,
      now,
    });
    const notes = normalizeReviewNotes(command);
    const reviewed =
      await this.reviewsRepository.approveSubmissionWithReview({
        schoolId: scope.schoolId,
        submission,
        reviewedById: scope.actorId,
        reviewedAt: now,
        note: notes.note,
        noteAr: notes.noteAr,
        assignmentStatus: assignmentUpdate.status,
        assignmentProgress: assignmentUpdate.progress,
        assignmentCompletedAt: assignmentUpdate.completedAt,
        metadata: {
          activeStageCount: assignmentUpdate.activeStageCount,
        },
      });

    await this.authRepository.createAuditLog(
      buildReviewAuditEntry({
        scope,
        action: 'reinforcement.review.approve',
        outcome: ReinforcementReviewOutcome.APPROVED,
        before: submission,
        after: reviewed,
      }),
    );

    return presentReinforcementReviewItemDetail(reviewed);
  }
}
