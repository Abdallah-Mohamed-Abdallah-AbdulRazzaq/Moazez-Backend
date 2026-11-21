import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod/v4';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { ResultExportService } from '../application/result-export.service';
import {
  resultsBulkQueue,
  resultsBulkReconcileJob,
  resultsExportJob,
} from '../domain/result-export.contract';

@Injectable()
export class ResultBulkWorker implements OnModuleInit {
  constructor(
    private readonly queue: BullmqService,
    private readonly exports: ResultExportService,
  ) {}

  onModuleInit(): void {
    this.queue.createWorker<{ id?: string }, void>(
      resultsBulkQueue,
      async (job) => {
        if (job.name === resultsBulkReconcileJob) {
          await this.exports.reconcile();
          return;
        }
        const id = z.uuid().safeParse(job.data.id);
        if (job.name !== resultsExportJob || !id.success)
          throw new Error('official_results.invalid_bulk_job');
        await this.exports.run(id.data);
      },
    );
  }
}
