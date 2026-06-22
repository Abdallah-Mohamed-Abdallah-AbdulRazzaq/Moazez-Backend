import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import {
  buildCommunicationNotificationPushJobId,
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
} from '../domain/communication-notification-generation-domain';

export interface CommunicationNotificationPushJobData {
  schoolId: string;
  organizationId: string;
  notificationId: string;
  deliveryId: string;
  actorUserId: string;
  actorUserType: UserType;
}

@Injectable()
export class CommunicationNotificationPushQueueService {
  constructor(private readonly bullmqService: BullmqService) {}

  enqueueNotificationPushDelivery(data: CommunicationNotificationPushJobData) {
    return this.bullmqService.addJob(
      COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
      COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
      data,
      {
        jobId: buildCommunicationNotificationPushJobId({
          deliveryId: data.deliveryId,
        }),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
