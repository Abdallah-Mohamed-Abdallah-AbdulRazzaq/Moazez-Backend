import { ImportJobStatus, Prisma } from '@prisma/client';
import { ImportJobRecord } from './import-job.types';

export type ImportJobReportData = {
  status: ImportJobStatus;
  summary: {
    rowCount: number | null;
    warningCount: number;
    errorCount: number;
  };
  file: {
    uploadedFileId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
  };
  rowCount: number | null;
  warnings: string[];
  errors: string[];
  updatedAt: string;
};

type ImportReportFileInput = {
  uploadedFileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint | number | string;
};

export function buildPendingImportJobReport(
  file: ImportReportFileInput,
): ImportJobReportData {
  return buildImportJobReport({
    status: ImportJobStatus.PENDING,
    file,
    warnings: ['Validation is queued.'],
    errors: [],
  });
}

export function buildProcessingImportJobReport(
  file: ImportReportFileInput,
): ImportJobReportData {
  return buildImportJobReport({
    status: ImportJobStatus.PROCESSING,
    file,
    warnings: ['Validation is in progress.'],
    errors: [],
  });
}

export function buildCompletedImportJobReport(
  file: ImportReportFileInput,
): ImportJobReportData {
  return buildImportJobReport({
    status: ImportJobStatus.COMPLETED,
    file,
    warnings: ['Stub validation only. No domain rows were created.'],
    errors: [],
  });
}

export function buildFailedImportJobReport(
  file: ImportReportFileInput,
  message: string,
): ImportJobReportData {
  return buildImportJobReport({
    status: ImportJobStatus.FAILED,
    file,
    warnings: [],
    errors: [message],
  });
}

export function normalizeImportJobReport(
  job: ImportJobRecord,
): ImportJobReportData {
  const fallback = buildImportJobReport({
    status: job.status,
    file: getImportJobReportFile(job),
    warnings: [],
    errors: [],
    updatedAt: job.updatedAt,
  });

  if (!isRecord(job.reportJson)) {
    return fallback;
  }

  const summary = isRecord(job.reportJson.summary) ? job.reportJson.summary : {};
  const file = isRecord(job.reportJson.file) ? job.reportJson.file : {};

  return {
    status:
      typeof job.reportJson.status === 'string'
        ? (job.reportJson.status as ImportJobStatus)
        : fallback.status,
    summary: {
      rowCount:
        typeof summary.rowCount === 'number' ? summary.rowCount : fallback.summary.rowCount,
      warningCount:
        typeof summary.warningCount === 'number'
          ? summary.warningCount
          : fallback.summary.warningCount,
      errorCount:
        typeof summary.errorCount === 'number'
          ? summary.errorCount
          : fallback.summary.errorCount,
    },
    file: {
      uploadedFileId:
        typeof file.uploadedFileId === 'string'
          ? file.uploadedFileId
          : fallback.file.uploadedFileId,
      originalName:
        typeof file.originalName === 'string'
          ? file.originalName
          : fallback.file.originalName,
      mimeType:
        typeof file.mimeType === 'string' ? file.mimeType : fallback.file.mimeType,
      sizeBytes:
        typeof file.sizeBytes === 'string' ? file.sizeBytes : fallback.file.sizeBytes,
    },
    rowCount:
      typeof job.reportJson.rowCount === 'number'
        ? job.reportJson.rowCount
        : fallback.rowCount,
    warnings: isStringArray(job.reportJson.warnings)
      ? job.reportJson.warnings
      : fallback.warnings,
    errors: isStringArray(job.reportJson.errors)
      ? job.reportJson.errors
      : fallback.errors,
    updatedAt:
      typeof job.reportJson.updatedAt === 'string'
        ? job.reportJson.updatedAt
        : fallback.updatedAt,
  };
}

export function toImportJobReportJson(
  report: ImportJobReportData,
): Prisma.InputJsonValue {
  return report as unknown as Prisma.InputJsonValue;
}

export function getImportJobReportFile(
  job: Pick<ImportJobRecord, 'uploadedFileId' | 'uploadedFile'>,
): ImportReportFileInput {
  return {
    uploadedFileId: job.uploadedFileId,
    originalName: job.uploadedFile?.originalName ?? 'unknown',
    mimeType: job.uploadedFile?.mimeType ?? 'application/octet-stream',
    sizeBytes: job.uploadedFile?.sizeBytes ?? '0',
  };
}

function buildImportJobReport(input: {
  status: ImportJobStatus;
  file: ImportReportFileInput;
  warnings: string[];
  errors: string[];
  updatedAt?: Date;
}): ImportJobReportData {
  return {
    status: input.status,
    summary: {
      rowCount: null,
      warningCount: input.warnings.length,
      errorCount: input.errors.length,
    },
    file: {
      uploadedFileId: input.file.uploadedFileId,
      originalName: input.file.originalName,
      mimeType: input.file.mimeType,
      sizeBytes: String(input.file.sizeBytes),
    },
    rowCount: null,
    warnings: input.warnings,
    errors: input.errors,
    updatedAt: (input.updatedAt ?? new Date()).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
