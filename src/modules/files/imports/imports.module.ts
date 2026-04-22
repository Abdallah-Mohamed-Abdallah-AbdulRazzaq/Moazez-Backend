import { Module } from '@nestjs/common';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { CreateImportJobUseCase } from './application/create-import-job.use-case';
import { GetImportJobUseCase } from './application/get-import-job.use-case';
import { GetImportReportUseCase } from './application/get-import-report.use-case';
import { ProcessImportValidationUseCase } from './application/process-import-validation.use-case';
import { ImportsController } from './controller/imports.controller';
import { ImportValidationWorker } from './infrastructure/import-validation.worker';
import { ImportJobsRepository } from './infrastructure/import-jobs.repository';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [QueueModule, StorageModule, UploadsModule],
  controllers: [ImportsController],
  providers: [
    ImportJobsRepository,
    CreateImportJobUseCase,
    GetImportJobUseCase,
    GetImportReportUseCase,
    ProcessImportValidationUseCase,
    ImportValidationWorker,
  ],
  exports: [
    ImportJobsRepository,
    CreateImportJobUseCase,
    GetImportJobUseCase,
    GetImportReportUseCase,
  ],
})
export class ImportsModule {}
