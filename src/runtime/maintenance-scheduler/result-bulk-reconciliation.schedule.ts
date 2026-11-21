import { Injectable, type OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  resultsBulkQueue,
  resultsBulkReconcileJob,
  resultsReconcileInterval,
} from '../../modules/official-results/domain/result-export.contract';

@Injectable()
export class ResultBulkReconciliationSchedule implements OnModuleInit {
  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      resultsBulkQueue,
      resultsBulkReconcileJob,
      {},
      {
        jobId: resultsBulkReconcileJob,
        repeat: { every: resultsReconcileInterval },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
