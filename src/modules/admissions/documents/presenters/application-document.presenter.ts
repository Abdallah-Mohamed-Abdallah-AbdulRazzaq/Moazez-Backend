import { ApplicationDocumentResponseDto } from '../dto/application-document.dto';
import { ApplicationDocumentRecord } from '../infrastructure/application-documents.repository';
import { mapApplicationDocumentStatusToApi } from '../../applications/domain/application.enums';

export function presentApplicationDocument(
  document: ApplicationDocumentRecord,
): ApplicationDocumentResponseDto {
  return {
    id: document.id,
    applicationId: document.applicationId,
    fileId: document.fileId,
    documentType: document.documentType,
    status: mapApplicationDocumentStatusToApi(document.status),
    notes: document.notes,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    file: {
      id: document.file.id,
      originalName: document.file.originalName,
      mimeType: document.file.mimeType,
      sizeBytes: document.file.sizeBytes.toString(),
      visibility: document.file.visibility,
    },
  };
}
