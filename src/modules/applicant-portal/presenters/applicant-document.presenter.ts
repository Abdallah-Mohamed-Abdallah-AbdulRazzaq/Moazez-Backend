import { ApplicantAdmissionRequestDocumentStatus } from '@prisma/client';
import {
  ApplicantDocumentApiStatus,
  ApplicantDocumentResponseDto,
  ApplicantDocumentsListResponseDto,
} from '../dto/applicant-document.dto';
import { ApplicantAdmissionRequestDocumentRecord } from '../infrastructure/applicant-portal.repository';

export function presentApplicantDocument(
  document: ApplicantAdmissionRequestDocumentRecord,
): ApplicantDocumentResponseDto {
  return {
    id: document.id,
    requestId: document.requestId,
    status: presentApplicantDocumentStatus(document.status),
    title: document.title,
    documentType: document.documentType,
    requiredDocument: document.requiredDocument
      ? {
          id: document.requiredDocument.id,
          title: document.requiredDocument.title,
          isMandatory: document.requiredDocument.isMandatory,
        }
      : null,
    file: {
      id: document.file.id,
      originalName: document.file.originalName,
      mimeType: document.file.mimeType,
      sizeBytes: Number(document.file.sizeBytes),
      checksumSha256: document.file.checksumSha256,
    },
    notes: publicText(document.notes),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function presentApplicantDocumentsList(
  documents: ApplicantAdmissionRequestDocumentRecord[],
): ApplicantDocumentsListResponseDto {
  return {
    data: sortApplicantDocuments(documents).map(presentApplicantDocument),
  };
}

export function sortApplicantDocuments(
  documents: ApplicantAdmissionRequestDocumentRecord[],
): ApplicantAdmissionRequestDocumentRecord[] {
  return [...documents].sort((left, right) => {
    const leftRequired = left.requiredDocument;
    const rightRequired = right.requiredDocument;

    if (leftRequired && !rightRequired) return -1;
    if (!leftRequired && rightRequired) return 1;

    if (leftRequired && rightRequired) {
      const sortOrderDelta = leftRequired.sortOrder - rightRequired.sortOrder;
      if (sortOrderDelta !== 0) return sortOrderDelta;

      const titleDelta = leftRequired.title.localeCompare(rightRequired.title);
      if (titleDelta !== 0) return titleDelta;
    }

    const createdAtDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdAtDelta !== 0) return createdAtDelta;

    return right.id.localeCompare(left.id);
  });
}

function presentApplicantDocumentStatus(
  status: ApplicantAdmissionRequestDocumentStatus,
): ApplicantDocumentApiStatus {
  switch (status) {
    case ApplicantAdmissionRequestDocumentStatus.UPLOADED:
      return 'uploaded';
    case ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT:
      return 'needs_replacement';
    case ApplicantAdmissionRequestDocumentStatus.ACCEPTED:
      return 'accepted';
    case ApplicantAdmissionRequestDocumentStatus.REJECTED:
      return 'rejected';
    case ApplicantAdmissionRequestDocumentStatus.SUPERSEDED:
      return 'superseded';
  }
}

function publicText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}
