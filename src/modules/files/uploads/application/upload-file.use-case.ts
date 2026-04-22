import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { requireFilesScope } from '../files-scope';
import {
  FILES_UPLOAD_MAX_SIZE_BYTES,
  isFilesUploadMimeTypeAllowed,
} from '../domain/file-upload.constraints';
import {
  FilesUploadMimeNotAllowedException,
  FilesUploadSizeExceededException,
} from '../domain/file-upload.exceptions';
import {
  buildSchoolFileObjectKey,
  normalizeOriginalFileName,
  UploadedMultipartFile,
} from '../domain/uploaded-file';
import {
  FileRecordResponseDto,
} from '../dto/register-file-metadata.dto';
import { RegisterFileMetadataUseCase } from './register-file-metadata.use-case';

@Injectable()
export class UploadFileUseCase {
  constructor(
    private readonly storageService: StorageService,
    private readonly registerFileMetadataUseCase: RegisterFileMetadataUseCase,
  ) {}

  async execute(
    file: UploadedMultipartFile | undefined,
  ): Promise<FileRecordResponseDto> {
    const scope = requireFilesScope();
    const uploadedFile = this.validateFile(file);
    const mimeType = uploadedFile.mimetype.trim().toLowerCase();
    const sizeBytes = BigInt(uploadedFile.buffer.byteLength);
    const objectKey = buildSchoolFileObjectKey(
      scope.schoolId,
      uploadedFile.originalname,
      randomUUID(),
    );

    const storedObject = await this.storageService.saveObject({
      objectKey,
      body: uploadedFile.buffer,
      visibility: FileVisibility.PRIVATE,
      contentType: mimeType,
    });

    try {
      return await this.registerFileMetadataUseCase.execute({
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        uploaderId: scope.actorId,
        bucket: storedObject.bucket,
        objectKey,
        originalName: normalizeOriginalFileName(uploadedFile.originalname),
        mimeType,
        sizeBytes,
        checksumSha256: createHash('sha256')
          .update(uploadedFile.buffer)
          .digest('hex'),
        visibility: FileVisibility.PRIVATE,
      });
    } catch (error) {
      await this.deleteStoredObjectQuietly(storedObject.bucket, objectKey);
      throw error;
    }
  }

  private validateFile(
    file: UploadedMultipartFile | undefined,
  ): UploadedMultipartFile {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new ValidationDomainException(
        'A multipart file field named "file" is required',
        { field: 'file' },
      );
    }

    if (file.buffer.byteLength > FILES_UPLOAD_MAX_SIZE_BYTES) {
      throw new FilesUploadSizeExceededException({
        maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES,
        actualSizeBytes: file.buffer.byteLength,
      });
    }

    if (!isFilesUploadMimeTypeAllowed(file.mimetype)) {
      throw new FilesUploadMimeNotAllowedException({
        mimeType: file.mimetype,
      });
    }

    return file;
  }

  private async deleteStoredObjectQuietly(
    bucket: string,
    objectKey: string,
  ): Promise<void> {
    try {
      await this.storageService.deleteObject({ bucket, objectKey });
    } catch {
      // Keep the original persistence error as the surfaced failure.
    }
  }
}
