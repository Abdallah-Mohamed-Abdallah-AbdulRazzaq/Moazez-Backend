import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
  DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
  DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID,
  DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN,
  type DismissalRequestExpiryJobData,
} from '../../modules/dismissal/requests/domain/dismissal-request-expiry.constants';

@Injectable()
export class DismissalExpirySchedule implements OnModuleInit {
  private readonly logger = new Logger(DismissalExpirySchedule.name);

  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob<DismissalRequestExpiryJobData>(
      DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
      DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
      {},
      {
        jobId: DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID,
        repeat: { pattern: DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN },
      },
    );
    this.logger.log({
      event: 'maintenance.schedule.registered',
      queue: DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
      job: DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
    });
  }
}
