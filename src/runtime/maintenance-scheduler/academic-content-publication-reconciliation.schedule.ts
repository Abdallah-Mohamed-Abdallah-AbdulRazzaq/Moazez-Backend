import { Injectable, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB,
  ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB_ID,
  ACADEMIC_CONTENT_PUBLICATION_RECONCILE_INTERVAL_MS,
} from '../../modules/academics/academic-content/domain/academic-content-publication-runtime.constants';

@Injectable()
export class AcademicContentPublicationReconciliationSchedule implements OnModuleInit {
  constructor(private readonly queue: BullmqService) {}
  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB,
      {},
      {
        jobId: ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB_ID,
        repeat: { every: ACADEMIC_CONTENT_PUBLICATION_RECONCILE_INTERVAL_MS },
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }
}
