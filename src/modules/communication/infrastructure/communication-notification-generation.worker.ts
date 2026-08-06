import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
import { CommunicationNotificationReconciliationService } from '../application/communication-notification-reconciliation.service';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
  CommunicationAnnouncementNotificationGenerationJobData,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationGenerationWorker implements OnModuleInit {
  constructor(
    private readonly bullmqService: BullmqService,
    private readonly generationService: CommunicationNotificationGenerationService,
    private readonly reconciliationService: CommunicationNotificationReconciliationService,
  ) {}

  onModuleInit(): void {
    this.bullmqService.createWorker<
      CommunicationAnnouncementNotificationGenerationJobData,
      void
    >(COMMUNICATION_NOTIFICATION_QUEUE_NAME, async (job) => {
      if (
        job.name === COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME
      ) {
        await this.reconciliationService.reconcile();
        return;
      }
      if (
        job.name !== COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME
      ) {
        throw new Error('communication_notification_job_unknown');
      }

      const context = createRequestContext(
        `communication-notification-generation:${job.id ?? job.data.announcementId}`,
      );
      if (job.data.actorUserId && job.data.actorUserType) {
        context.actor = {
          id: job.data.actorUserId,
          userType: job.data.actorUserType,
        };
      }
      context.activeMembership = {
        membershipId: 'queue:communication-notification-generation',
        organizationId: job.data.organizationId,
        schoolId: job.data.schoolId,
        roleId: 'queue:communication-notification-generation',
        permissions: [],
      };

      await runWithRequestContext(context, () =>
        this.generationService.generateForPublishedAnnouncement(job.data),
      );
    });
  }
}
