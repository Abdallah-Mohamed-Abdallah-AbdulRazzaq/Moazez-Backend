import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_RECONCILE_INTERVAL_MS,
} from '../../modules/communication/domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationReconciliationSchedule implements OnModuleInit {
  private readonly logger = new Logger(
    CommunicationNotificationReconciliationSchedule.name,
  );

  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
      {},
      {
        jobId: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
        repeat: { every: COMMUNICATION_NOTIFICATION_RECONCILE_INTERVAL_MS },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log({
      event: 'maintenance.schedule.registered',
      queue: COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      job: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
    });
  }
}
