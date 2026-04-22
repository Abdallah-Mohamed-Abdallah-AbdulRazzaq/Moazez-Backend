import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  FILES_IMPORT_QUEUE_NAME,
  ImportValidationJobData,
} from '../domain/import-job.types';
import { ProcessImportValidationUseCase } from '../application/process-import-validation.use-case';

@Injectable()
export class ImportValidationWorker implements OnModuleInit {
  private worker: Worker<ImportValidationJobData, void, string> | null = null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly processImportValidationUseCase: ProcessImportValidationUseCase,
  ) {}

  onModuleInit(): void {
    this.worker = this.bullmqService.createWorker<ImportValidationJobData, void>(
      FILES_IMPORT_QUEUE_NAME,
      async (job) => {
        await this.processImportValidationUseCase.execute(job.data.importJobId);
      },
    );
  }
}
