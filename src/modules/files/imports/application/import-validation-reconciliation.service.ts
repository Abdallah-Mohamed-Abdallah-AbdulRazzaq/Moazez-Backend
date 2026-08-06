import { Injectable } from '@nestjs/common';
import { ImportJobStatus } from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  buildFailedImportJobReport,
  getImportJobReportFile,
  readImportJobRecovery,
  toImportJobRecoveryReportJson,
} from '../domain/import-job.report';
import {
  FILES_IMPORT_PROCESSING_LEASE_MS,
  FILES_IMPORT_QUEUE_NAME,
  FILES_IMPORT_RECOVERY_WINDOW_MS,
  FILES_IMPORT_TERMINAL_WINDOW_EXPIRED_CODE,
  FILES_IMPORT_TERMINAL_SOURCE_INELIGIBLE_CODE,
  FILES_IMPORT_TERMINAL_TENANT_INELIGIBLE_CODE,
  FILES_IMPORT_VALIDATE_JOB_NAME,
} from '../domain/import-job.types';
import {
  ImportJobRecoveryCandidate,
  ImportJobsRepository,
} from '../infrastructure/import-jobs.repository';

const RECOVERY_PAGE_SIZE = 100;

@Injectable()
export class ImportValidationReconciliationService {
  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
    private readonly bullmqService: BullmqService,
  ) {}

  async reconcile(now = new Date()): Promise<void> {
    let cursor: { createdAt: Date; id: string } | undefined;
    for (;;) {
      const candidates = await this.importJobsRepository.listRecoveryCandidates(
        {
          createdBefore: now,
          cursor,
          limit: RECOVERY_PAGE_SIZE,
        },
      );
      for (const candidate of candidates) {
        await this.reconcileCandidate(candidate, now);
      }
      if (candidates.length < RECOVERY_PAGE_SIZE) return;
      const last = candidates[candidates.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  async reconcileCandidate(
    candidate: ImportJobRecoveryCandidate,
    now: Date,
  ): Promise<void> {
    if (!isRecoverable(candidate, now)) return;
    if (candidate.ineligibilityCode) {
      await this.importJobsRepository.updateImportJob({
        importJobId: candidate.id,
        status: ImportJobStatus.FAILED,
        reportJson: toImportJobRecoveryReportJson(
          buildFailedImportJobReport(
            getImportJobReportFile(candidate),
            'Import source is ineligible for recovery.',
          ),
          {
            classification: 'terminal',
            code:
              candidate.ineligibilityCode ===
              FILES_IMPORT_TERMINAL_TENANT_INELIGIBLE_CODE
                ? FILES_IMPORT_TERMINAL_TENANT_INELIGIBLE_CODE
                : FILES_IMPORT_TERMINAL_SOURCE_INELIGIBLE_CODE,
          },
        ),
      });
      return;
    }
    if (
      candidate.createdAt.getTime() + FILES_IMPORT_RECOVERY_WINDOW_MS <=
      now.getTime()
    ) {
      await this.importJobsRepository.updateImportJob({
        importJobId: candidate.id,
        status: ImportJobStatus.FAILED,
        reportJson: toImportJobRecoveryReportJson(
          buildFailedImportJobReport(
            getImportJobReportFile(candidate),
            'Import validation recovery window expired.',
          ),
          {
            classification: 'terminal',
            code: FILES_IMPORT_TERMINAL_WINDOW_EXPIRED_CODE,
          },
        ),
      });
      return;
    }

    await this.bullmqService.ensureJobFromPersistedTruth(
      FILES_IMPORT_QUEUE_NAME,
      FILES_IMPORT_VALIDATE_JOB_NAME,
      { importJobId: candidate.id },
      {
        jobId: candidate.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}

function isRecoverable(
  candidate: ImportJobRecoveryCandidate,
  now: Date,
): boolean {
  if (candidate.status === ImportJobStatus.PENDING) return true;
  if (candidate.status === ImportJobStatus.FAILED) {
    return (
      readImportJobRecovery(candidate.reportJson)?.classification ===
      'retryable'
    );
  }
  return (
    candidate.status === ImportJobStatus.PROCESSING &&
    candidate.updatedAt.getTime() <=
      now.getTime() - FILES_IMPORT_PROCESSING_LEASE_MS
  );
}
