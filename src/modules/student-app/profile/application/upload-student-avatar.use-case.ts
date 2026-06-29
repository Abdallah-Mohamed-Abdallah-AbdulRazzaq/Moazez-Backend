import { createHash, randomUUID } from 'node:crypto';
import { FileVisibility, AuditOutcome, UserType } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { RegisterFileMetadataUseCase } from '../../../files/uploads/application/register-file-metadata.use-case';
import { FileRecordResponseDto } from '../../../files/uploads/dto/register-file-metadata.dto';
import {
  FilesUploadMimeNotAllowedException,
  FilesUploadSizeExceededException,
} from '../../../files/uploads/domain/file-upload.exceptions';
import {
  buildSchoolFileObjectKey,
  normalizeOriginalFileName,
  UploadedMultipartFile,
} from '../../../files/uploads/domain/uploaded-file';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import {
  isStudentAvatarMimeTypeAllowed,
  STUDENT_AVATAR_MAX_SIZE_BYTES,
} from '../domain/student-avatar.constraints';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { StudentAvatarRepository } from '../infrastructure/student-avatar.repository';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
import { buildStudentProfileResponse } from './student-profile-response.builder';
import { StudentAppStudentNotFoundException } from '../../shared/student-app-errors';

@Injectable()
export class UploadStudentAvatarUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly avatarRepository: StudentAvatarRepository,
    private readonly readAdapter: StudentProfileReadAdapter,
    private readonly storageService: StorageService,
    private readonly registerFileMetadataUseCase: RegisterFileMetadataUseCase,
    private readonly filesRepository: FilesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    file: UploadedMultipartFile | undefined,
  ): Promise<StudentProfileResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const previousAvatar =
      await this.avatarRepository.findStudentAvatarState(context);

    if (!previousAvatar) {
      throw new StudentAppStudentNotFoundException({
        reason: 'student_avatar_identity_missing',
      });
    }

    const uploadedFile = this.validateAvatar(file);
    const mimeType = uploadedFile.mimetype.trim().toLowerCase();
    const objectKey = buildSchoolFileObjectKey(
      context.schoolId,
      uploadedFile.originalname,
      randomUUID(),
    );
    const storedObject = await this.storageService.saveObject({
      objectKey,
      body: uploadedFile.buffer,
      visibility: FileVisibility.PRIVATE,
      contentType: mimeType,
    });

    const storedFile = await this.registerAvatarFileMetadata({
      context,
      uploadedFile,
      storedObject,
      objectKey,
      mimeType,
    });

    try {
      const updated = await this.avatarRepository.setStudentAvatarFile({
        context,
        avatarFileId: storedFile.id,
      });

      if (!updated) {
        throw new StudentAppStudentNotFoundException({
          reason: 'student_avatar_update_target_missing',
        });
      }

    } catch (error) {
      await this.deleteStoredObjectQuietly(storedObject.bucket, objectKey);
      await this.softDeleteFileQuietly(storedFile.id);
      throw error;
    }

    await this.recordAudit({
      context,
      action: previousAvatar.avatarFileId
        ? 'student.profile.avatar.replace'
        : 'student.profile.avatar.upload',
      fileId: storedFile.id,
      previousFileId: previousAvatar.avatarFileId,
      mimeType,
      sizeBytes: uploadedFile.buffer.byteLength,
    });

    return buildStudentProfileResponse({
      context,
      readAdapter: this.readAdapter,
    });
  }

  private async registerAvatarFileMetadata(params: {
    context: StudentAppContext;
    uploadedFile: UploadedMultipartFile;
    storedObject: { bucket: string };
    objectKey: string;
    mimeType: string;
  }): Promise<FileRecordResponseDto> {
    try {
      return await this.registerFileMetadataUseCase.execute({
        organizationId: params.context.organizationId,
        schoolId: params.context.schoolId,
        uploaderId: params.context.studentUserId,
        bucket: params.storedObject.bucket,
        objectKey: params.objectKey,
        originalName: normalizeOriginalFileName(params.uploadedFile.originalname),
        mimeType: params.mimeType,
        sizeBytes: BigInt(params.uploadedFile.buffer.byteLength),
        checksumSha256: createHash('sha256')
          .update(params.uploadedFile.buffer)
          .digest('hex'),
        visibility: FileVisibility.PRIVATE,
      });
    } catch (error) {
      await this.deleteStoredObjectQuietly(
        params.storedObject.bucket,
        params.objectKey,
      );
      throw error;
    }
  }

  private validateAvatar(
    file: UploadedMultipartFile | undefined,
  ): UploadedMultipartFile {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new ValidationDomainException(
        'A multipart file field named "file" is required',
        { field: 'file' },
      );
    }

    if (file.buffer.byteLength > STUDENT_AVATAR_MAX_SIZE_BYTES) {
      throw new FilesUploadSizeExceededException({
        maxSizeBytes: STUDENT_AVATAR_MAX_SIZE_BYTES,
        actualSizeBytes: file.buffer.byteLength,
      });
    }

    if (!isStudentAvatarMimeTypeAllowed(file.mimetype)) {
      throw new FilesUploadMimeNotAllowedException({
        mimeType: file.mimetype,
      });
    }

    return file;
  }

  private async recordAudit(params: {
    context: StudentAppContext;
    action: string;
    fileId: string;
    previousFileId: string | null;
    mimeType: string;
    sizeBytes: number;
  }): Promise<void> {
    await this.authRepository.createAuditLog({
      actorId: params.context.studentUserId,
      userType: UserType.STUDENT,
      organizationId: params.context.organizationId,
      schoolId: params.context.schoolId,
      module: 'student_app',
      action: params.action,
      resourceType: 'student_profile_avatar',
      resourceId: params.context.studentId,
      outcome: AuditOutcome.SUCCESS,
      after: {
        studentId: params.context.studentId,
        fileId: params.fileId,
        previousFileId: params.previousFileId,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        source: 'student_app',
      },
    });
  }

  private async deleteStoredObjectQuietly(
    bucket: string,
    objectKey: string,
  ): Promise<void> {
    try {
      await this.storageService.deleteObject({ bucket, objectKey });
    } catch {
      // Preserve the original failure.
    }
  }

  private async softDeleteFileQuietly(fileId: string): Promise<void> {
    try {
      await this.filesRepository.softDeleteFile(fileId);
    } catch {
      // Preserve the original failure.
    }
  }
}
