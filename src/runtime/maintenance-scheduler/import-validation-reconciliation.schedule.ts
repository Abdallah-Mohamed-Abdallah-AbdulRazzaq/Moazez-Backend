import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  FILES_IMPORT_QUEUE_NAME,
  FILES_IMPORT_RECONCILE_INTERVAL_MS,
  FILES_IMPORT_RECONCILE_JOB_NAME,
} from '../../modules/files/imports/domain/import-job.types';

@Injectable()
export class ImportValidationReconciliationSchedule implements OnModuleInit {
  private readonly logger = new Logger(
    ImportValidationReconciliationSchedule.name,
  );

  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      FILES_IMPORT_QUEUE_NAME,
      FILES_IMPORT_RECONCILE_JOB_NAME,
      {},
      {
        jobId: FILES_IMPORT_RECONCILE_JOB_NAME,
        repeat: { every: FILES_IMPORT_RECONCILE_INTERVAL_MS },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log({
      event: 'maintenance.schedule.registered',
      queue: FILES_IMPORT_QUEUE_NAME,
      job: FILES_IMPORT_RECONCILE_JOB_NAME,
    });
  }
}
