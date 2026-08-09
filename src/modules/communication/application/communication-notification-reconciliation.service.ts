import { Injectable } from '@nestjs/common';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import {
  buildAnnouncementNotificationGenerationJobId,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
} from '../domain/communication-notification-generation-domain';
import { CommunicationNotificationGenerationRepository } from '../infrastructure/communication-notification-generation.repository';

const ANNOUNCEMENT_RECOVERY_PAGE_SIZE = 100;

@Injectable()
export class CommunicationNotificationReconciliationService {
  constructor(
    private readonly repository: CommunicationNotificationGenerationRepository,
    private readonly queue: BullmqService,
  ) {}

  async reconcile(now = new Date()): Promise<number> {
    const windowStartedAt = new Date(
      now.getTime() - COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
    );
    let cursor: { publishedAt: Date; id: string } | undefined;
    let restored = 0;

    do {
      const page =
        await this.repository.listPublishedAnnouncementRecoveryCandidates({
          now,
          windowStartedAt,
          after: cursor,
          take: ANNOUNCEMENT_RECOVERY_PAGE_SIZE,
        });

      for (const announcement of page.candidates) {
        const result = await this.queue.ensureJobFromPersistedTruth(
          COMMUNICATION_NOTIFICATION_QUEUE_NAME,
          COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
          {
            schoolId: announcement.schoolId,
            organizationId: announcement.organizationId,
            announcementId: announcement.id,
            actorUserId: announcement.actorUserId,
            actorUserType: announcement.actorUserType,
          },
          {
            jobId: buildAnnouncementNotificationGenerationJobId({
              schoolId: announcement.schoolId,
              announcementId: announcement.id,
            }),
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );
        if (result === 'created' || result === 'replaced') restored += 1;
      }

      cursor = page.next ?? undefined;
    } while (cursor);

    return restored;
  }
}
