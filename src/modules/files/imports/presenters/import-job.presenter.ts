import {
  ImportJobReportResponseDto,
  ImportJobStatusResponseDto,
} from '../dto/create-import-job.dto';
import { normalizeImportJobReport } from '../domain/import-job.report';
import { ImportJobRecord } from '../domain/import-job.types';

export function presentImportJobStatus(
  job: ImportJobRecord,
): ImportJobStatusResponseDto {
  return {
    id: job.id,
    uploadedFileId: job.uploadedFileId,
    type: job.type,
    status: job.status,
    reportAvailable: job.reportJson !== null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function presentImportJobReport(
  job: ImportJobRecord,
): ImportJobReportResponseDto {
  return normalizeImportJobReport(job);
}
