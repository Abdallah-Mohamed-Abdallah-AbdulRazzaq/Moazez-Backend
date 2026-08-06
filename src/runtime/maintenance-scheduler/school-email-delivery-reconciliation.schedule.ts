import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SCHOOL_EMAIL_DELIVERY_RECONCILE_INTERVAL_MS,
  SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME,
} from '../../modules/settings/email/delivery/domain/email-delivery.constants';

@Injectable()
export class SchoolEmailDeliveryReconciliationSchedule implements OnModuleInit {
  private readonly logger = new Logger(
    SchoolEmailDeliveryReconciliationSchedule.name,
  );

  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
      SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME,
      {},
      {
        jobId: SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME,
        repeat: { every: SCHOOL_EMAIL_DELIVERY_RECONCILE_INTERVAL_MS },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log({
      event: 'maintenance.schedule.registered',
      queue: SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
      job: SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME,
    });
  }
}
