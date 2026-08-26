import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  StudentBulkRegistrationBatchStatus,
} from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { STUDENTS_BULK_REGISTRATION_IMPORT_TYPE } from '../../../files/imports/domain/import-upload.constraints';
import { readStudentBulkRegistrationExecutionMetadata } from '../domain/student-bulk-registration-execution.metadata';
import {
  StudentBulkRegistrationExecutionInvariantException,
  StudentBulkRegistrationExecutionMetadataException,
} from '../domain/student-bulk-registration.exceptions';
import type { StudentBulkRegistrationRowError } from '../domain/student-bulk-registration-csv';
import {
  StudentBulkRegistrationExecutionRepository,
  type StudentBulkRegistrationExecutionBatch,
} from '../infrastructure/student-bulk-registration-execution.repository';

const PERMANENT_ROW_BUSINESS_ERROR_CODES = new Set([
  'iam.user.login_email_taken',
  'platform.entitlement.student_seat_limit_exceeded',
  'students.enrollment.placement_conflict',
  'students.enrollment.inactive_year',
  'students.account.student_role_missing',
  'students.bulk_registration.row_data_invalid',
  'students.bulk_registration.execution_placement_invalid',
]);

@Injectable()
export class ProcessStudentBulkRegistrationExecutionUseCase {
  constructor(
    private readonly repository: StudentBulkRegistrationExecutionRepository,
  ) {}

  async execute(batchId: string): Promise<void> {
    const batch = await this.repository.findExecutionBatchById(batchId);
    if (
      !batch ||
      batch.status !== StudentBulkRegistrationBatchStatus.EXECUTING
    ) {
      return;
    }
    const metadata = assertExecutionContext(batch);
    const context = createRequestContext(
      `student-bulk-registration-execution:${batch.id}`,
    );
    context.actor = {
      id: metadata.requestedById,
      userType: metadata.requestedByUserType,
    };
    context.activeMembership = {
      membershipId: 'queue:student-bulk-registration-execution',
      organizationId: batch.organizationId,
      schoolId: batch.schoolId,
      roleId: 'queue:student-bulk-registration-execution',
      permissions: [],
    };

    await runWithRequestContext(context, async () => {
      const rowIds = await this.repository.listValidRowIds({
        batchId: batch.id,
        schoolId: batch.schoolId,
      });
      for (const rowId of rowIds) {
        try {
          await this.repository.provisionRow({
            batchId: batch.id,
            schoolId: batch.schoolId,
            rowId,
          });
        } catch (error) {
          const rowError = toPermanentRowError(error);
          if (!rowError) throw error;
          await this.repository.markRowFailed({
            batchId: batch.id,
            schoolId: batch.schoolId,
            rowId,
            error: rowError,
          });
        }
      }
      await this.repository.finalizeExecution({
        batchId: batch.id,
        schoolId: batch.schoolId,
      });
    });
  }
}

function assertExecutionContext(batch: StudentBulkRegistrationExecutionBatch) {
  if (
    batch.sourceImportJob.id !== batch.sourceImportJobId ||
    batch.sourceImportJob.schoolId !== batch.schoolId ||
    batch.sourceImportJob.type !== STUDENTS_BULK_REGISTRATION_IMPORT_TYPE ||
    batch.sourceImportJob.status !== ImportJobStatus.COMPLETED ||
    batch.school.organizationId !== batch.organizationId
  ) {
    throw new StudentBulkRegistrationExecutionInvariantException();
  }
  const metadata = readStudentBulkRegistrationExecutionMetadata(
    batch.sourceImportJob.reportJson,
  );
  if (!metadata) throw new StudentBulkRegistrationExecutionMetadataException();
  return metadata;
}

function toPermanentRowError(
  error: unknown,
): StudentBulkRegistrationRowError | null {
  if (
    !(error instanceof DomainException) ||
    !PERMANENT_ROW_BUSINESS_ERROR_CODES.has(error.code)
  ) {
    return null;
  }
  return {
    code: error.code,
    field: error.code === 'iam.user.login_email_taken' ? 'username' : null,
  };
}
