import { FileRecordResponseDto } from '../dto/register-file-metadata.dto';
import { StoredFileMetadata } from '../domain/stored-file-metadata';

export function presentFileRecord(
  file: StoredFileMetadata,
): FileRecordResponseDto {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes.toString(),
    visibility: file.visibility,
    createdAt: file.createdAt.toISOString(),
  };
}
