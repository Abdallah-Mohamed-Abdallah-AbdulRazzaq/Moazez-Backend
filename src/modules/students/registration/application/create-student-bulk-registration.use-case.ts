import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { RegisterFileMetadataUseCase } from '../../../files/uploads/application/register-file-metadata.use-case';
import {
  buildSchoolFileObjectKey,
  normalizeOriginalFileName,
  type UploadedMultipartFile,
} from '../../../files/uploads/domain/uploaded-file';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import {
  buildPendingImportJobReport,
  toImportJobReportJson,
} from '../../../files/imports/domain/import-job.report';
import {
  FILES_IMPORT_QUEUE_NAME,
  FILES_IMPORT_VALIDATE_JOB_NAME,
} from '../../../files/imports/domain/import-job.types';
import { validateFilesImportUpload } from '../../../files/imports/domain/import-upload.validator';
import { toEnrollmentDate } from '../../enrollments/application/shared';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type {
  CreateStudentBulkRegistrationDto,
  StudentBulkRegistrationBatchResponseDto,
} from '../dto/student-bulk-registration.dto';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';
import type { StudentBulkRegistrationBatchRecord } from '../infrastructure/student-bulk-registration.repository';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';
import { presentStudentBulkRegistrationBatch } from '../presenters/student-bulk-registration.presenter';

@Injectable()
export class CreateStudentBulkRegistrationUseCase {
  constructor(
    private readonly placementService: StudentBulkRegistrationPlacementService,
    private readonly storageService: StorageService,
    private readonly registerFileMetadataUseCase: RegisterFileMetadataUseCase,
    private readonly filesRepository: FilesRepository,
    private readonly repository: StudentBulkRegistrationRepository,
    private readonly bullmqService: BullmqService,
  ) {}

  async execute(
    command: CreateStudentBulkRegistrationDto,
    file: UploadedMultipartFile | undefined,
  ): Promise<StudentBulkRegistrationBatchResponseDto> {
    const scope = requireStudentsScope();
    const uploadedFile = validateFilesImportUpload(file);
    const placement = await this.placementService.resolve(command);
    const normalizedMimeType = uploadedFile.mimetype.trim().toLowerCase();
    const normalizedOriginalName = normalizeOriginalFileName(
      uploadedFile.originalname,
    );
    const objectKey = buildSchoolFileObjectKey(
      scope.schoolId,
      normalizedOriginalName,
      randomUUID(),
    );

    const storedObject = await this.storageService.saveObject({
      objectKey,
      body: uploadedFile.buffer,
      visibility: FileVisibility.PRIVATE,
      contentType: normalizedMimeType,
    });

    let uploadedFileId: string | null = null;

    let batch: StudentBulkRegistrationBatchRecord;
    try {
      const storedFile = await this.registerFileMetadataUseCase.execute({
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        uploaderId: scope.actorId,
        bucket: storedObject.bucket,
        objectKey,
        originalName: normalizedOriginalName,
        mimeType: normalizedMimeType,
        sizeBytes: BigInt(uploadedFile.buffer.byteLength),
        checksumSha256: createHash('sha256')
          .update(uploadedFile.buffer)
          .digest('hex'),
        visibility: FileVisibility.PRIVATE,
      });
      uploadedFileId = storedFile.id;

      batch = await this.repository.createIntake({
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        uploadedFileId: storedFile.id,
        createdById: scope.actorId,
        reportJson: toImportJobReportJson(
          buildPendingImportJobReport({
            uploadedFileId: storedFile.id,
            originalName: normalizedOriginalName,
            mimeType: normalizedMimeType,
            sizeBytes: uploadedFile.buffer.byteLength,
          }),
        ),
        academicYearId: placement.academicYear.id,
        termId: placement.term?.id ?? null,
        classroomId: placement.classroom.id,
        enrollmentDate: toEnrollmentDate(placement.enrollmentDate),
      });
    } catch (error) {
      await this.deleteStoredObjectQuietly(storedObject.bucket, objectKey);
      if (uploadedFileId) {
        await this.softDeleteFileQuietly(uploadedFileId);
      }
      throw error;
    }

    try {
      await this.bullmqService.ensureJobFromPersistedTruth(
        FILES_IMPORT_QUEUE_NAME,
        FILES_IMPORT_VALIDATE_JOB_NAME,
        { importJobId: batch.sourceImportJobId },
        {
          jobId: batch.sourceImportJobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    } catch {
      // The committed PENDING ImportJob remains recoverable by reconciliation.
    }

    return presentStudentBulkRegistrationBatch(batch);
  }

  private async deleteStoredObjectQuietly(
    bucket: string,
    objectKey: string,
  ): Promise<void> {
    try {
      await this.storageService.deleteObject({ bucket, objectKey });
    } catch {
      // Keep the original intake failure as the surfaced error.
    }
  }

  private async softDeleteFileQuietly(fileId: string): Promise<void> {
    try {
      await this.filesRepository.softDeleteFile(fileId);
    } catch {
      // Keep the original intake failure as the surfaced error.
    }
  }
}
