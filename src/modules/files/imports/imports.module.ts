import { Module } from '@nestjs/common';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { CreateImportJobUseCase } from './application/create-import-job.use-case';
import { GetImportJobUseCase } from './application/get-import-job.use-case';
import { GetImportReportUseCase } from './application/get-import-report.use-case';
import { ImportsController } from './controller/imports.controller';
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
  ],
  exports: [
    ImportJobsRepository,
    CreateImportJobUseCase,
    GetImportJobUseCase,
    GetImportReportUseCase,
  ],
})
export class ImportsModule {}
