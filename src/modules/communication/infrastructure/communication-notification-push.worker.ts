import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationPushDeliveryService } from '../application/communication-notification-push-delivery.service';
import {
  CommunicationNotificationPushJobData,
} from '../application/communication-notification-push-queue.service';
import { COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME } from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationPushWorker
  implements OnModuleInit, OnModuleDestroy
{
  private worker: Worker<CommunicationNotificationPushJobData, void, string> | null =
    null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly pushDeliveryService: CommunicationNotificationPushDeliveryService,
  ) {}

  onModuleInit(): void {
    this.worker = this.bullmqService.createWorker<
      CommunicationNotificationPushJobData,
      void
    >(COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME, async (job) => {
      const context = createRequestContext(
        `communication-notification-push:${job.id ?? job.data.deliveryId}`,
      );
      context.actor = {
        id: job.data.actorUserId,
        userType: job.data.actorUserType,
      };
      context.activeMembership = {
        membershipId: 'queue:communication-notification-push',
        organizationId: job.data.organizationId,
        schoolId: job.data.schoolId,
        roleId: 'queue:communication-notification-push',
        permissions: [],
      };

      await runWithRequestContext(context, () =>
        this.pushDeliveryService.processDelivery({
          schoolId: job.data.schoolId,
          deliveryId: job.data.deliveryId,
        }),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }
}
