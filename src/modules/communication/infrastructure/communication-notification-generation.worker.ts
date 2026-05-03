import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { Worker } from 'bullmq';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
import {
  CommunicationAnnouncementNotificationGenerationJobData,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationGenerationWorker implements OnModuleInit {
  private worker: Worker<
    CommunicationAnnouncementNotificationGenerationJobData,
    void,
    string
  > | null = null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly generationService: CommunicationNotificationGenerationService,
  ) {}

  onModuleInit(): void {
    this.worker = this.bullmqService.createWorker<
      CommunicationAnnouncementNotificationGenerationJobData,
      void
    >(COMMUNICATION_NOTIFICATION_QUEUE_NAME, async (job) => {
      const context = createRequestContext(
        `communication-notification-generation:${job.id ?? job.data.announcementId}`,
      );
      context.actor = {
        id: job.data.actorUserId,
        userType: job.data.actorUserType ?? UserType.SERVICE_ACCOUNT,
      };
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
