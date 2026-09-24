import { Injectable, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  ACADEMIC_CONTENT_CLEANUP_INTERVAL_MS,
  ACADEMIC_CONTENT_CLEANUP_QUEUE,
  ACADEMIC_CONTENT_DISCOVERY_JOB,
  ACADEMIC_CONTENT_DISCOVERY_JOB_ID,
} from '../../modules/academics/academic-content/files/domain/academic-content-file.constants';

@Injectable()
export class AcademicContentCleanupSchedule implements OnModuleInit {
  constructor(private readonly queue: BullmqService) {}
  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      ACADEMIC_CONTENT_CLEANUP_QUEUE,
      ACADEMIC_CONTENT_DISCOVERY_JOB,
      {},
      {
        jobId: ACADEMIC_CONTENT_DISCOVERY_JOB_ID,
        repeat: { every: ACADEMIC_CONTENT_CLEANUP_INTERVAL_MS },
        attempts: 1,
      },
    );
  }
}
