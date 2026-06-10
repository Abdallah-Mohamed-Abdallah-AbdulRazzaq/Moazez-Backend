import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';

export interface NormalizeApplicantDocumentInput {
  title?: string;
  documentType?: string;
  notes?: string;
}

export interface NormalizedApplicantDocumentText {
  title: string | null;
  documentType: string | null;
  notes: string | null;
}

const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/i;

export function normalizeApplicantDocumentInput(
  input: NormalizeApplicantDocumentInput,
): NormalizedApplicantDocumentText {
  return {
    title: normalizeOptionalText(input.title),
    documentType: normalizeOptionalText(input.documentType),
    notes: normalizeOptionalText(input.notes),
  };
}

export function resolveOptionalApplicantDocumentText(
  input: NormalizedApplicantDocumentText,
): { title: string; documentType: string } | null {
  const fallback = input.title ?? input.documentType;
  if (!fallback) return null;

  return {
    title: input.title ?? fallback,
    documentType: input.documentType ?? fallback,
  };
}

export function sanitizeApplicantOriginalFileName(
  originalName: string,
): string {
  const normalized = basename(originalName.replace(/\\/g, '/'))
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ');

  return normalized.length > 0 ? normalized : 'file';
}

export function buildApplicantDocumentObjectKey(input: {
  schoolId: string;
  requestId: string;
  originalName: string;
  uniqueId?: string;
}): string {
  const extension = extname(
    sanitizeApplicantOriginalFileName(input.originalName),
  ).toLowerCase();
  const safeExtension = SAFE_EXTENSION_PATTERN.test(extension) ? extension : '';
  const fileId = input.uniqueId ?? randomUUID();

  return `schools/${input.schoolId}/applicant-requests/${input.requestId}/documents/${fileId}${safeExtension}`;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}
