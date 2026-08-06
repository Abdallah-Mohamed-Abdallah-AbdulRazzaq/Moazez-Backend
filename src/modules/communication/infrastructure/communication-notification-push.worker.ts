import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationPushDeliveryService } from '../application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushReconciliationService } from '../application/communication-notification-push-reconciliation.service';
import { CommunicationNotificationPushJobData } from '../application/communication-notification-push-queue.service';
import {
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_RECONCILE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationPushWorker implements OnModuleInit {
  constructor(
    private readonly bullmqService: BullmqService,
    private readonly pushDeliveryService: CommunicationNotificationPushDeliveryService,
    private readonly reconciliationService: CommunicationNotificationPushReconciliationService,
  ) {}

  onModuleInit(): void {
    this.bullmqService.createWorker<CommunicationNotificationPushJobData, void>(
      COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
      async (job) => {
        if (job.name === COMMUNICATION_NOTIFICATION_PUSH_RECONCILE_JOB_NAME) {
          await this.reconciliationService.reconcile();
          return;
        }
        if (job.name !== COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME) {
          throw new Error('communication_notification_push_job_unknown');
        }

        const context = createRequestContext(
          `communication-notification-push:${job.id ?? job.data.deliveryId}`,
        );
        if (job.data.actorUserId && job.data.actorUserType) {
          context.actor = {
            id: job.data.actorUserId,
            userType: job.data.actorUserType,
          };
        }
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
      },
    );
  }
}
