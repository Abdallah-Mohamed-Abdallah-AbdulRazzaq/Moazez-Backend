import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  LEARNING_MEDIA_CLEANUP_QUEUE,
  LEARNING_MEDIA_DISCOVERY_JOB_ID,
  LEARNING_MEDIA_DISCOVERY_JOB_NAME,
} from '../../modules/files/uploads/domain/learning-media-cleanup.constants';
import { LEARNING_MEDIA_CLEANUP_INTERVAL_MS } from '../../modules/files/uploads/domain/learning-media.constants';

@Injectable()
export class LearningMediaCleanupSchedule implements OnModuleInit {
  private readonly logger = new Logger(LearningMediaCleanupSchedule.name);

  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      LEARNING_MEDIA_CLEANUP_QUEUE,
      LEARNING_MEDIA_DISCOVERY_JOB_NAME,
      {},
      {
        jobId: LEARNING_MEDIA_DISCOVERY_JOB_ID,
        repeat: { every: LEARNING_MEDIA_CLEANUP_INTERVAL_MS },
        attempts: 1,
      },
    );
    this.logger.log({
      event: 'maintenance.schedule.registered',
      queue: LEARNING_MEDIA_CLEANUP_QUEUE,
      job: LEARNING_MEDIA_DISCOVERY_JOB_NAME,
    });
  }
}
