import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  FILES_IMPORT_QUEUE_NAME,
  FILES_IMPORT_RECONCILE_JOB_NAME,
  FILES_IMPORT_VALIDATE_JOB_NAME,
  ImportValidationJobData,
} from '../domain/import-job.types';
import { ProcessImportValidationUseCase } from '../application/process-import-validation.use-case';
import { ImportValidationReconciliationService } from '../application/import-validation-reconciliation.service';
import { ImportJobsRepository } from './import-jobs.repository';
import { STUDENTS_BULK_REGISTRATION_IMPORT_TYPE } from '../domain/import-upload.constraints';
import { ProcessStudentBulkRegistrationValidationUseCase } from '../../../students/registration/application/process-student-bulk-registration-validation.use-case';

@Injectable()
export class ImportValidationWorker implements OnModuleInit {
  private worker: Worker<ImportValidationJobData, void, string> | null = null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly processImportValidationUseCase: ProcessImportValidationUseCase,
    private readonly reconciliationService: ImportValidationReconciliationService,
    private readonly importJobsRepository: ImportJobsRepository,
    @Optional()
    private readonly processStudentBulkRegistrationValidationUseCase?: ProcessStudentBulkRegistrationValidationUseCase,
  ) {}

  onModuleInit(): void {
    this.worker = this.bullmqService.createWorker<
      ImportValidationJobData,
      void
    >(FILES_IMPORT_QUEUE_NAME, async (job) => {
      if (job.name === FILES_IMPORT_RECONCILE_JOB_NAME) {
        await this.reconciliationService.reconcile();
        return;
      }
      if (job.name !== FILES_IMPORT_VALIDATE_JOB_NAME) {
        throw new Error('files_import_job_unknown');
      }
      const persisted = await this.importJobsRepository.findRecoveryContextById(
        job.data.importJobId,
      );
      if (!persisted) return;
      if (persisted.ineligibilityCode) {
        await this.reconciliationService.reconcileCandidate(
          persisted,
          new Date(),
        );
        return;
      }
      const context = createRequestContext(
        `files-import-validation:${job.id ?? persisted.id}`,
      );
      if (persisted.createdById && persisted.actorUserType) {
        context.actor = {
          id: persisted.createdById,
          userType: persisted.actorUserType,
        };
      }
      context.activeMembership = {
        membershipId: 'queue:files-import-validation',
        organizationId: persisted.organizationId,
        schoolId: persisted.schoolId,
        roleId: 'queue:files-import-validation',
        permissions: [],
      };
      await runWithRequestContext(context, async () => {
        if (persisted.type === 'students_basic') {
          await this.processImportValidationUseCase.execute(persisted.id);
          return;
        }
        if (persisted.type === STUDENTS_BULK_REGISTRATION_IMPORT_TYPE) {
          if (!this.processStudentBulkRegistrationValidationUseCase) {
            throw new Error('bulk_registration_validation_processor_missing');
          }
          await this.processStudentBulkRegistrationValidationUseCase.execute(
            persisted.id,
          );
          return;
        }
        throw new Error('files_import_persisted_type_unknown');
      });
    });
  }
}
