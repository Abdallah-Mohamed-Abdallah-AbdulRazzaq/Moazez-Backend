import { Injectable } from '@nestjs/common';
import {
  FileRecordResponseDto,
  RegisterFileMetadataDto,
} from '../dto/register-file-metadata.dto';
import { FilesRepository } from '../infrastructure/files.repository';
import { presentFileRecord } from '../presenters/file-record.presenter';
import { normalizeChecksumSha256 } from '../validators/checksum.validator';

@Injectable()
export class RegisterFileMetadataUseCase {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(
    command: RegisterFileMetadataDto,
  ): Promise<FileRecordResponseDto> {
    const file = await this.filesRepository.createFileRecord({
      organizationId: command.organizationId ?? null,
      schoolId: command.schoolId ?? null,
      uploaderId: command.uploaderId ?? null,
      bucket: command.bucket,
      objectKey: command.objectKey,
      originalName: command.originalName,
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      checksumSha256: normalizeChecksumSha256(command.checksumSha256),
      visibility: command.visibility,
    });

    return presentFileRecord(file);
  }
}
