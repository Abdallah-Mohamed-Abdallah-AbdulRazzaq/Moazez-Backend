import { Injectable } from '@nestjs/common';
import { ImportJobStatus } from '@prisma/client';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  buildCompletedImportJobReport,
  buildFailedImportJobReport,
  buildProcessingImportJobReport,
  getImportJobReportFile,
  readImportJobRecovery,
  toImportJobRecoveryReportJson,
  toImportJobReportJson,
} from '../domain/import-job.report';
import {
  FILES_IMPORT_PROCESSING_LEASE_MS,
  FILES_IMPORT_RETRYABLE_STORAGE_CODE,
  FILES_IMPORT_TERMINAL_METADATA_MISSING_CODE,
  FILES_IMPORT_TERMINAL_OBJECT_MISSING_CODE,
} from '../domain/import-job.types';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';

@Injectable()
export class ProcessImportValidationUseCase {
  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
    private readonly storageService: StorageService,
  ) {}

  async execute(importJobId: string): Promise<void> {
    const importJob =
      await this.importJobsRepository.findImportJobById(importJobId);
    if (!importJob) {
      return;
    }

    if (importJob.status === ImportJobStatus.COMPLETED) return;

    const file = getImportJobReportFile(importJob);
    const recovery = readImportJobRecovery(importJob.reportJson);
    if (
      importJob.status === ImportJobStatus.FAILED &&
      recovery?.classification !== 'retryable'
    ) {
      return;
    }
    const claimed = await this.importJobsRepository.claimImportJobProcessing({
      importJobId,
      retryableFailed: recovery?.classification === 'retryable',
      staleProcessingBefore: new Date(
        Date.now() - FILES_IMPORT_PROCESSING_LEASE_MS,
      ),
      reportJson: toImportJobReportJson(buildProcessingImportJobReport(file)),
    });
    if (!claimed) return;

    if (!claimed.uploadedFile) {
      await this.persistTerminalFailure(
        claimed,
        FILES_IMPORT_TERMINAL_METADATA_MISSING_CODE,
        'Uploaded file metadata is unavailable.',
      );
      return;
    }

    try {
      await this.storageService.statObject({
        bucket: claimed.uploadedFile.bucket,
        objectKey: claimed.uploadedFile.objectKey,
      });

      await this.importJobsRepository.updateImportJob({
        importJobId,
        status: ImportJobStatus.COMPLETED,
        reportJson: toImportJobReportJson(buildCompletedImportJobReport(file)),
      });
    } catch (error) {
      if (isObjectStorageNotFoundError(error)) {
        await this.persistTerminalFailure(
          claimed,
          FILES_IMPORT_TERMINAL_OBJECT_MISSING_CODE,
          'Uploaded object is unavailable.',
        );
        return;
      }
      await this.importJobsRepository.updateImportJob({
        importJobId,
        status: ImportJobStatus.FAILED,
        reportJson: toImportJobRecoveryReportJson(
          buildFailedImportJobReport(
            file,
            'Storage validation is awaiting recovery.',
          ),
          {
            classification: 'retryable',
            code: FILES_IMPORT_RETRYABLE_STORAGE_CODE,
          },
        ),
      });
      throw new Error('import_validation_retryable_failure');
    }
  }

  private async persistTerminalFailure(
    importJob: Parameters<typeof getImportJobReportFile>[0] & { id: string },
    code: string,
    message: string,
  ): Promise<void> {
    await this.importJobsRepository.updateImportJob({
      importJobId: importJob.id,
      status: ImportJobStatus.FAILED,
      reportJson: toImportJobRecoveryReportJson(
        buildFailedImportJobReport(getImportJobReportFile(importJob), message),
        { classification: 'terminal', code },
      ),
    });
  }
}
