import { Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
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
import { resultsExportJob } from '../domain/result-export.contract';

const jobNames = new Set<string>([
  resultsExportJob,
  resultIssueReportJob,
  resultApplyImportJob,
  resultValidateJob,
]);
const payloadSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive().optional(),
  dispatchRevision: z.number().int().positive().optional(),
});

@Injectable()
export class ResultBulkProcessor {
  constructor(
    private readonly exports: ResultExportService,
    private readonly imports: ResultImportWorkService,
    private readonly apply: ResultImportApplyService,
    private readonly issues: ResultIssueReportService,
    private readonly notices: ResultNoticeService,
  ) {}

  handles(name: string): boolean {
    return jobNames.has(name);
  }

  async process(name: string, data: unknown): Promise<void> {
    const payload = payloadSchema.safeParse(data);
    if (!payload.success) throw new Error('official_results.invalid_bulk_job');
    const { id, revision, dispatchRevision } = payload.data;
    if (name === resultsExportJob) return this.exports.run(id);
    if (name === resultIssueReportJob) return this.issues.run(id);
    if (name === resultValidateJob && revision !== undefined)
      return this.imports.run(id, revision);
    if (name === resultApplyImportJob && dispatchRevision !== undefined)
      return this.apply.run(id, dispatchRevision);
    throw new Error('official_results.invalid_bulk_job');
  }

  async reconcile(): Promise<void> {
    await Promise.all([
      this.exports.reconcile(),
      this.imports.reconcile(),
      this.apply.reconcile(),
      this.issues.reconcile(),
      this.notices.reconcile(),
    ]);
  }
}
