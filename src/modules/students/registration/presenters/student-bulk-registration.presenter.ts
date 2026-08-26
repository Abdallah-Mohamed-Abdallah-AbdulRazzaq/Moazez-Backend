import type {
  StudentBulkRegistrationBatchDetailResponseDto,
  StudentBulkRegistrationBatchResponseDto,
} from '../dto/student-bulk-registration.dto';
import type { StudentBulkRegistrationBatchRecord } from '../infrastructure/student-bulk-registration.repository';
import { readImportJobBatchValidationErrors } from '../../../files/imports/domain/import-job.report';

export function presentStudentBulkRegistrationBatch(
  batch: StudentBulkRegistrationBatchRecord,
): StudentBulkRegistrationBatchResponseDto {
  return {
    id: batch.id,
    sourceImportJobId: batch.sourceImportJobId,
    status: batch.status,
    templateVersion: batch.templateVersion,
    placement: {
      academicYearId: batch.academicYearId,
      termId: batch.termId,
      classroomId: batch.classroomId,
      enrollmentDate: batch.enrollmentDate.toISOString().slice(0, 10),
    },
    counters: {
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      createdRows: batch.createdRows,
      failedRows: batch.failedRows,
    },
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

export function presentStudentBulkRegistrationBatchDetail(
  batch: StudentBulkRegistrationBatchRecord,
): StudentBulkRegistrationBatchDetailResponseDto {
  return {
    ...presentStudentBulkRegistrationBatch(batch),
    validatedAt: batch.validatedAt?.toISOString() ?? null,
    startedAt: batch.startedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
    validationErrors: readImportJobBatchValidationErrors(
      batch.sourceImportJob.reportJson,
    ),
  };
}
