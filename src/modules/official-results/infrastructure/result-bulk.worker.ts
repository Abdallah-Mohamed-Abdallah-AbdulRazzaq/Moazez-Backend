import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod/v4';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { ResultExportService } from '../application/result-export.service';
import { ResultImportWorkService } from '../application/result-import-work.service';
import { ResultImportApplyService } from '../application/result-import-apply.service';
import {
  ResultIssueReportService,
  resultIssueReportJob,
} from '../application/result-issue-report.service';
import { ResultNoticeService } from '../application/result-notice.service';
import { resultApplyImportJob } from '../domain/result-import-execution.contract';
import { resultValidateJob } from '../domain/result-import.contract';
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
    private readonly imports: ResultImportWorkService,
    private readonly apply: ResultImportApplyService,
    private readonly issues: ResultIssueReportService,
    private readonly notices: ResultNoticeService,
  ) {}

  onModuleInit(): void {
    this.queue.createWorker<
      { id?: string; revision?: number; dispatchRevision?: number },
      void
    >(resultsBulkQueue, async (job) => {
      if (job.name === resultsBulkReconcileJob) {
        await Promise.all([
          this.exports.reconcile(),
          this.imports.reconcile(),
          this.apply.reconcile(),
          this.issues.reconcile(),
          this.notices.reconcile(),
        ]);
        return;
      }
      const id = z.uuid().safeParse(job.data.id);
      if (job.name === resultIssueReportJob && id.success)
        return this.issues.run(id.data);
      if (job.name === resultApplyImportJob && id.success) {
        const version = z
          .number()
          .int()
          .positive()
          .parse(job.data.dispatchRevision);
        return this.apply.run(id.data, version);
      }
      if (job.name === resultValidateJob && id.success) {
        const revision = z.number().int().positive().parse(job.data.revision);
        return this.imports.run(id.data, revision);
      }
      if (job.name !== resultsExportJob || !id.success)
        throw new Error('official_results.invalid_bulk_job');
      await this.exports.run(id.data);
    });
  }
}
