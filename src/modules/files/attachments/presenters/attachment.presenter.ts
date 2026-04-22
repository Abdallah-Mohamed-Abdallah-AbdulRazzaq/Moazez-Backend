import { AttachmentResponseDto } from '../dto/link-attachment.dto';
import { AttachmentRecord } from '../domain/attachment-record';

export function presentAttachment(
  attachment: AttachmentRecord,
): AttachmentResponseDto {
  return {
    id: attachment.id,
    fileId: attachment.fileId,
    resourceType: attachment.resourceType,
    resourceId: attachment.resourceId,
    createdAt: attachment.createdAt.toISOString(),
    file: {
      id: attachment.file.id,
      originalName: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes.toString(),
      visibility: attachment.file.visibility,
    },
  };
}
