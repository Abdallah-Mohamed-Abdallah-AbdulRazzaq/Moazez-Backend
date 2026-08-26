import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  Prisma,
  SchoolLoginSettingsStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
} from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  buildBulkRegistrationValidationReport,
  buildFailedImportJobReport,
  buildProcessingImportJobReport,
  getImportJobReportFile,
  readImportJobRecovery,
  toImportJobRecoveryReportJson,
  toImportJobReportJson,
} from '../../../files/imports/domain/import-job.report';
import {
  FILES_IMPORT_PROCESSING_LEASE_MS,
  FILES_IMPORT_RETRYABLE_STORAGE_CODE,
  FILES_IMPORT_TERMINAL_METADATA_MISSING_CODE,
  FILES_IMPORT_TERMINAL_OBJECT_MISSING_CODE,
} from '../../../files/imports/domain/import-job.types';
import { ImportJobsRepository } from '../../../files/imports/infrastructure/import-jobs.repository';
import { FILES_IMPORT_MAX_SIZE_BYTES } from '../../../files/imports/domain/import-upload.constraints';
import { LoginIdentityRepository } from '../../../settings/login-identity/infrastructure/login-identity.repository';
import {
  collectCandidateLoginEmails,
  parseStudentBulkRegistrationCsv,
  STUDENT_BULK_REGISTRATION_ERROR_CODES,
  validateStudentBulkRegistrationIdentityRows,
} from '../domain/student-bulk-registration-csv';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

@Injectable()
export class ProcessStudentBulkRegistrationValidationUseCase {
  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
    private readonly repository: StudentBulkRegistrationRepository,
    private readonly storageService: StorageService,
    private readonly loginIdentityRepository: LoginIdentityRepository,
    private readonly placementService: StudentBulkRegistrationPlacementService,
  ) {}

  async execute(importJobId: string): Promise<void> {
    const importJob =
      await this.importJobsRepository.findImportJobById(importJobId);
    if (!importJob || importJob.status === ImportJobStatus.COMPLETED) return;

    const recovery = readImportJobRecovery(importJob.reportJson);
    if (
      importJob.status === ImportJobStatus.FAILED &&
      recovery?.classification !== 'retryable'
    ) {
      return;
    }
    const file = getImportJobReportFile(importJob);
    const batch = await this.repository.claimValidation({
      importJobId,
      schoolId: importJob.schoolId,
      retryableFailed: recovery?.classification === 'retryable',
      staleProcessingBefore: new Date(
        Date.now() - FILES_IMPORT_PROCESSING_LEASE_MS,
      ),
      reportJson: toImportJobReportJson(buildProcessingImportJobReport(file)),
    });
    if (!batch) return;

    if (!importJob.uploadedFile) {
      await this.persistTerminalFailure(
        importJobId,
        importJob.schoolId,
        file,
        FILES_IMPORT_TERMINAL_METADATA_MISSING_CODE,
        'Uploaded file metadata is unavailable.',
      );
      return;
    }

    try {
      const stream = await this.storageService.getObject({
        bucket: importJob.uploadedFile.bucket,
        objectKey: importJob.uploadedFile.objectKey,
      });
      const source = await readBoundedStream(stream);
      const parsed = parseStudentBulkRegistrationCsv(source);
      const batchErrors = [...parsed.batchErrors];
      const settings = await this.loginIdentityRepository.findCurrentSettings();
      if (!settings || settings.status !== SchoolLoginSettingsStatus.ACTIVE) {
        batchErrors.push(
          STUDENT_BULK_REGISTRATION_ERROR_CODES.loginSettingsUnavailable,
        );
      } else {
        const candidateLoginEmails = collectCandidateLoginEmails(
          parsed.rows,
          settings,
        );
        const existingUsers =
          await this.loginIdentityRepository.findUsersByLoginEmails(
            candidateLoginEmails,
          );
        validateStudentBulkRegistrationIdentityRows(
          parsed.rows,
          settings,
          new Set(existingUsers.map((user) => user.email)),
        );
      }

      const validRows = parsed.rows.filter((row) => row.errors.length === 0);
      try {
        await this.placementService.resolveForValidation(
          {
            academicYearId: batch.academicYearId,
            termId: batch.termId ?? undefined,
            classroomId: batch.classroomId,
            enrollmentDate: batch.enrollmentDate.toISOString().slice(0, 10),
          },
          validRows.length,
        );
      } catch (error) {
        if (!(error instanceof DomainException)) throw error;
        batchErrors.push(error.code);
      }

      const invalidRows = parsed.rows.length - validRows.length;
      const validationFailed = batchErrors.length > 0 || invalidRows > 0;
      await this.repository.finalizeValidation({
        importJobId,
        schoolId: importJob.schoolId,
        batchId: batch.id,
        batchStatus: validationFailed
          ? StudentBulkRegistrationBatchStatus.VALIDATION_FAILED
          : StudentBulkRegistrationBatchStatus.READY,
        rows: parsed.rows.map((row) => ({
          rowNumber: row.rowNumber,
          normalizedDataJson:
            row.normalizedData as unknown as Prisma.InputJsonValue,
          rowHash: row.rowHash,
          status:
            row.errors.length === 0
              ? StudentBulkRegistrationRowStatus.VALID
              : StudentBulkRegistrationRowStatus.INVALID,
          errorsJson:
            row.errors.length === 0
              ? null
              : (row.errors as unknown as Prisma.InputJsonValue),
        })),
        validRows: validRows.length,
        invalidRows,
        reportJson: toImportJobReportJson(
          buildBulkRegistrationValidationReport({
            file,
            rowCount: parsed.rows.length,
            invalidRowCount: invalidRows,
            batchErrors: [...new Set(batchErrors)],
          }),
        ),
        validatedAt: new Date(),
      });
    } catch (error) {
      if (isObjectStorageNotFoundError(error)) {
        await this.persistTerminalFailure(
          importJobId,
          importJob.schoolId,
          file,
          FILES_IMPORT_TERMINAL_OBJECT_MISSING_CODE,
          'Uploaded object is unavailable.',
        );
        return;
      }
      await this.repository.failValidation({
        importJobId,
        schoolId: importJob.schoolId,
        batchStatus: StudentBulkRegistrationBatchStatus.UPLOADED,
        reportJson: toImportJobRecoveryReportJson(
          buildFailedImportJobReport(
            file,
            'Bulk registration validation is awaiting recovery.',
          ),
          {
            classification: 'retryable',
            code: FILES_IMPORT_RETRYABLE_STORAGE_CODE,
          },
        ),
      });
      throw new Error('bulk_registration_validation_retryable_failure');
    }
  }

  private persistTerminalFailure(
    importJobId: string,
    schoolId: string,
    file: Parameters<typeof buildFailedImportJobReport>[0],
    code: string,
    message: string,
  ): Promise<void> {
    return this.repository.failValidation({
      importJobId,
      schoolId,
      batchStatus: StudentBulkRegistrationBatchStatus.FAILED,
      reportJson: toImportJobRecoveryReportJson(
        buildFailedImportJobReport(file, message),
        { classification: 'terminal', code },
      ),
    });
  }
}

async function readBoundedStream(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as AsyncIterable<unknown>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.byteLength;
    if (size > FILES_IMPORT_MAX_SIZE_BYTES) {
      throw new Error('bulk_registration_source_size_exceeded');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}
