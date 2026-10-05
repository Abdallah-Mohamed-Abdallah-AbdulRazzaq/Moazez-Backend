import { Injectable, Logger } from '@nestjs/common';
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';
import type { CommunicationAcademicContentReviewDecisionJobData } from '../../../communication/domain/communication-notification-generation-domain';

@Injectable()
export class AcademicContentReviewDecisionNotificationEnqueueService {
  private readonly logger = new Logger(
    AcademicContentReviewDecisionNotificationEnqueueService.name,
  );
  constructor(private readonly queue: CommunicationNotificationQueueService) {}

  async ensureAfterDecisionCommit(
    identity: CommunicationAcademicContentReviewDecisionJobData,
  ): Promise<void> {
    try {
      await this.queue.ensureAcademicContentReviewDecision(identity);
    } catch {
      this.logger.warn({
        event: 'academic_content.review_decision_notification.enqueue_failed',
        schoolId: identity.schoolId,
        approvalId: identity.approvalId,
        reason: 'post_commit_enqueue_failed',
      });
    }
  }
}
