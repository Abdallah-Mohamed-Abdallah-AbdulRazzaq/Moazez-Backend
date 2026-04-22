import { Injectable } from '@nestjs/common';
import { ImportJobStatus } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  buildCompletedImportJobReport,
  buildFailedImportJobReport,
  buildProcessingImportJobReport,
  getImportJobReportFile,
  toImportJobReportJson,
} from '../domain/import-job.report';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';

@Injectable()
export class ProcessImportValidationUseCase {
  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
    private readonly storageService: StorageService,
  ) {}

  async execute(importJobId: string): Promise<void> {
    const importJob = await this.importJobsRepository.findImportJobById(
      importJobId,
    );
    if (!importJob) {
      throw new Error(`Import job not found: ${importJobId}`);
    }

    const file = getImportJobReportFile(importJob);

    await this.importJobsRepository.updateImportJob({
      importJobId,
      status: ImportJobStatus.PROCESSING,
      reportJson: toImportJobReportJson(buildProcessingImportJobReport(file)),
    });

    try {
      if (!importJob.uploadedFile) {
        throw new Error('Uploaded file metadata is missing');
      }

      await this.storageService.statObject({
        bucket: importJob.uploadedFile.bucket,
        objectKey: importJob.uploadedFile.objectKey,
      });

      await this.importJobsRepository.updateImportJob({
        importJobId,
        status: ImportJobStatus.COMPLETED,
        reportJson: toImportJobReportJson(buildCompletedImportJobReport(file)),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Import validation failed';

      await this.importJobsRepository.updateImportJob({
        importJobId,
        status: ImportJobStatus.FAILED,
        reportJson: toImportJobReportJson(
          buildFailedImportJobReport(file, message),
        ),
      });

      throw error;
    }
  }
}
