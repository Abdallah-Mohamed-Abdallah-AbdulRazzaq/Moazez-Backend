import { StudentDocumentResponseDto } from '../dto/student-document.dto';
import {
  mapStudentDocumentStatusToApi,
} from '../domain/student-document-status.enums';
import { StudentDocumentRecord } from '../infrastructure/student-documents.repository';

function resolveFileType(mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized.includes('/')) {
    return null;
  }

  return normalized.split('/')[1]?.split('+')[0] ?? null;
}

function buildSecureDownloadUrl(fileId: string): string {
  return `/api/v1/files/${fileId}/download`;
}

export function presentStudentDocument(
  document: StudentDocumentRecord,
): StudentDocumentResponseDto {
  return {
    id: document.id,
    studentId: document.studentId,
    fileId: document.fileId,
    type: document.documentType,
    name: document.file.originalName,
    status: mapStudentDocumentStatusToApi(document.status),
    uploadedDate: document.createdAt.toISOString(),
    url: buildSecureDownloadUrl(document.file.id),
    fileType: resolveFileType(document.file.mimeType),
    notes: document.notes,
  };
}
