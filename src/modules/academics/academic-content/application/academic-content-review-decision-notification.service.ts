import { Injectable } from '@nestjs/common';
import { CommunicationNotificationGenerationService } from '../../../communication/application/communication-notification-generation.service';
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';
import {
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
  CommunicationAcademicContentReviewDecisionJobData,
  CommunicationPreparedAcademicContentReviewDecision,
  isAcademicContentReviewDecisionJobData,
} from '../../../communication/domain/communication-notification-generation-domain';
import {
  AcademicContentReviewDecisionNotificationRepository,
  AcademicContentReviewDecisionRecoveryCursor,
  AcademicContentReviewDecisionSource,
  reviewDecisionJobData,
} from '../infrastructure/academic-content-review-decision-notification.repository';

function prepare(
  source: AcademicContentReviewDecisionSource,
  now: Date,
): CommunicationPreparedAcademicContentReviewDecision {
  if (source.status !== 'APPROVED' && source.status !== 'CHANGES_REQUESTED')
    throw new Error('academic_content_review_decision_source_invalid');
  return {
    ...reviewDecisionJobData(source),
    academicContentId: source.academicContentId,
    revisionId: source.revisionId,
    roundNumber: source.roundNumber,
    decision: source.status,
    recipientUserId: source.submittedByUserId,
    title:
      source.status === 'APPROVED'
        ? 'Academic content approved'
        : 'Changes requested',
    body: source.revision.title,
    now,
  };
}

@Injectable()
export class AcademicContentReviewDecisionNotificationService {
  constructor(
    private readonly repository: AcademicContentReviewDecisionNotificationRepository,
    private readonly generation: CommunicationNotificationGenerationService,
    private readonly queue: CommunicationNotificationQueueService,
  ) {}

  async generate(
    identity: CommunicationAcademicContentReviewDecisionJobData,
    now?: Date,
  ) {
    if (!isAcademicContentReviewDecisionJobData(identity))
      throw new Error('academic_content_review_decision_job_invalid');
    const asOf = now ?? new Date();
    const source = await this.repository.findSource(identity, asOf);
    if (!source || !(await this.repository.eligibleRecipient(source)))
      return {
        recipientCount: 0,
        createdNotificationCount: 0,
        skippedReason: 'source_or_recipient_not_eligible',
      };
    return this.generation.generateForAcademicContentReviewDecision(
      prepare(source, asOf),
      async (tx) => {
        const authorizedAt = now ?? new Date();
        const current = await this.repository.authorize(
          tx,
          identity,
          authorizedAt,
        );
        return current ? prepare(current, authorizedAt) : null;
      },
    );
  }

  async recover(now: Date): Promise<number> {
    const windowStartedAt = new Date(
      now.getTime() - COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
    );
    let cursor: AcademicContentReviewDecisionRecoveryCursor | undefined,
      restored = 0;
    do {
      const page = await this.repository.listRecoveryCandidates(
        now,
        windowStartedAt,
        cursor,
      );
      for (const candidate of page.candidates) {
        const identity = reviewDecisionJobData(candidate);
        const source = await this.repository.findSource(identity, now);
        if (!source || !(await this.repository.eligibleRecipient(source)))
          continue;
        const result = await this.queue.ensureAcademicContentReviewDecision(
          reviewDecisionJobData(source),
        );
        if (result === 'created' || result === 'replaced') restored++;
      }
      cursor = page.next ?? undefined;
    } while (cursor);
    return restored;
  }
}
