import {
  AdmissionRequiredDocumentResponseDto,
  AdmissionRequiredDocumentsListResponseDto,
} from '../dto/admission-required-document.dto';
import type { AdmissionRequiredDocumentRecord } from '../infrastructure/applicant-portal.repository';

export function presentAdmissionRequiredDocument(
  document: AdmissionRequiredDocumentRecord,
): AdmissionRequiredDocumentResponseDto {
  return {
    id: document.id,
    title: publicText(document.title) ?? document.title,
    description: publicText(document.description),
    isMandatory: document.isMandatory,
    acceptedFileTypes: normalizeAcceptedFileTypes(document.acceptedFileTypes),
    maxFiles: document.maxFiles,
    sortOrder: document.sortOrder,
  };
}

export function presentAdmissionRequiredDocumentsList(
  documents: AdmissionRequiredDocumentRecord[],
): AdmissionRequiredDocumentsListResponseDto {
  return {
    data: documents.map(presentAdmissionRequiredDocument),
  };
}

function publicText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeAcceptedFileTypes(
  values: readonly string[] | null | undefined,
): string[] {
  const unique = new Set<string>();

  for (const value of values ?? []) {
    const normalized = publicText(value);
    if (normalized) unique.add(normalized);
  }

  return [...unique];
}
