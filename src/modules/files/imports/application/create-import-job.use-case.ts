import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FileVisibility, ImportJobStatus } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  buildSchoolFileObjectKey,
  normalizeOriginalFileName,
  UploadedMultipartFile,
} from '../../uploads/domain/uploaded-file';
import { RegisterFileMetadataUseCase } from '../../uploads/application/register-file-metadata.use-case';
import { FilesRepository } from '../../uploads/infrastructure/files.repository';
import {
  CreateImportJobRequestDto,
  ImportJobStatusResponseDto,
} from '../dto/create-import-job.dto';
import {
  buildFailedImportJobReport,
  buildPendingImportJobReport,
  toImportJobRecoveryReportJson,
  toImportJobReportJson,
} from '../domain/import-job.report';
import { validateFilesImportUpload } from '../domain/import-upload.validator';
import {
  FILES_IMPORT_QUEUE_NAME,
  FILES_IMPORT_RETRYABLE_ENQUEUE_CODE,
  FILES_IMPORT_VALIDATE_JOB_NAME,
} from '../domain/import-job.types';
import { requireImportsScope } from '../imports-scope';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { presentImportJobStatus } from '../presenters/import-job.presenter';
import { normalizeImportJobType } from '../validators/import-job.validator';

@Injectable()
export class CreateImportJobUseCase {
  constructor(
    private readonly storageService: StorageService,
    private readonly registerFileMetadataUseCase: RegisterFileMetadataUseCase,
    private readonly filesRepository: FilesRepository,
    private readonly importJobsRepository: ImportJobsRepository,
    private readonly bullmqService: BullmqService,
  ) {}

  async execute(
    command: CreateImportJobRequestDto,
    file: UploadedMultipartFile | undefined,
  ): Promise<ImportJobStatusResponseDto> {
    const scope = requireImportsScope();
    const importType = normalizeImportJobType(command.type);
    const uploadedFile = validateFilesImportUpload(file);
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

      const importJob = await this.importJobsRepository.createImportJob({
        schoolId: scope.schoolId,
        uploadedFileId: storedFile.id,
        type: importType,
        createdById: scope.actorId,
        status: ImportJobStatus.PENDING,
        reportJson: toImportJobReportJson(
          buildPendingImportJobReport({
            uploadedFileId: storedFile.id,
            originalName: normalizedOriginalName,
            mimeType: normalizedMimeType,
            sizeBytes: uploadedFile.buffer.byteLength,
          }),
        ),
      });

      try {
        await this.bullmqService.addJob(
          FILES_IMPORT_QUEUE_NAME,
          FILES_IMPORT_VALIDATE_JOB_NAME,
          { importJobId: importJob.id },
          {
            jobId: importJob.id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );

        return presentImportJobStatus(importJob);
      } catch {
        const failedJob = await this.importJobsRepository.updateImportJob({
          importJobId: importJob.id,
          status: ImportJobStatus.FAILED,
          reportJson: toImportJobRecoveryReportJson(
            buildFailedImportJobReport(
              {
                uploadedFileId: storedFile.id,
                originalName: normalizedOriginalName,
                mimeType: normalizedMimeType,
                sizeBytes: uploadedFile.buffer.byteLength,
              },
              'Import validation is awaiting recovery.',
            ),
            {
              classification: 'retryable',
              code: FILES_IMPORT_RETRYABLE_ENQUEUE_CODE,
            },
          ),
        });

        return presentImportJobStatus(failedJob);
      }
    } catch (error) {
      await this.deleteStoredObjectQuietly(storedObject.bucket, objectKey);
      if (uploadedFileId) {
        await this.softDeleteFileQuietly(uploadedFileId);
      }
      throw error;
    }
  }

  private async deleteStoredObjectQuietly(
    bucket: string,
    objectKey: string,
  ): Promise<void> {
    try {
      await this.storageService.deleteObject({ bucket, objectKey });
    } catch {
      // Keep the original failure as the surfaced error.
    }
  }

  private async softDeleteFileQuietly(fileId: string): Promise<void> {
    try {
      await this.filesRepository.softDeleteFile(fileId);
    } catch {
      // Keep the original failure as the surfaced error.
    }
  }
}
