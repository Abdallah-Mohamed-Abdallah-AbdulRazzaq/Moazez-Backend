import { ValidationDomainException } from '../../../common/exceptions/domain-exception';

export const APPLICANT_REQUEST_STATUS_FILTERS = [
  'draft',
  'needs_action',
  'submitted',
  'under_review',
  'waitlisted',
  'accepted',
  'rejected',
] as const;

export type ApplicantRequestStatusFilter =
  (typeof APPLICANT_REQUEST_STATUS_FILTERS)[number];

export interface NormalizedCreateApplicantRequestInput {
  schoolId: string;
  requestedAcademicYearId: string | null;
  requestedGradeId: string | null;
  childFirstName: string;
  childLastName: string | null;
  childFullName: string;
  childDateOfBirth: Date | null;
  childGender: string | null;
  childNationality: string | null;
  previousSchool: string | null;
  notes: string | null;
}

export interface NormalizedApplicantRequestsQuery {
  page: number;
  limit: number;
  status?: ApplicantRequestStatusFilter;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function normalizeCreateApplicantRequestInput(input: {
  schoolId: string;
  requestedAcademicYearId?: string | null;
  requestedGradeId?: string | null;
  childFirstName: string;
  childLastName?: string | null;
  childDateOfBirth?: string | null;
  childGender?: string | null;
  childNationality?: string | null;
  previousSchool?: string | null;
  notes?: string | null;
}): NormalizedCreateApplicantRequestInput {
  const childFirstName = normalizeRequiredText(
    input.childFirstName,
    'childFirstName',
    100,
  );
  const childLastName = normalizeOptionalText(
    input.childLastName,
    'childLastName',
    100,
  );

  return {
    schoolId: input.schoolId,
    requestedAcademicYearId: normalizeOptionalId(input.requestedAcademicYearId),
    requestedGradeId: normalizeOptionalId(input.requestedGradeId),
    childFirstName,
    childLastName,
    childFullName: buildChildFullName(childFirstName, childLastName),
    childDateOfBirth: normalizeOptionalDate(
      input.childDateOfBirth,
      'childDateOfBirth',
    ),
    childGender: normalizeOptionalText(input.childGender, 'childGender', 40),
    childNationality: normalizeOptionalText(
      input.childNationality,
      'childNationality',
      80,
    ),
    previousSchool: normalizeOptionalText(
      input.previousSchool,
      'previousSchool',
      180,
    ),
    notes: normalizeOptionalText(input.notes, 'notes', 2000),
  };
}

export function normalizeApplicantRequestsQuery(input?: {
  page?: number;
  limit?: number;
  status?: string;
}): NormalizedApplicantRequestsQuery {
  return {
    page: normalizePositiveInteger(input?.page, 'page', DEFAULT_PAGE),
    limit: Math.min(
      normalizePositiveInteger(input?.limit, 'limit', DEFAULT_LIMIT),
      MAX_LIMIT,
    ),
    status: normalizeStatusFilter(input?.status),
  };
}

function buildChildFullName(
  firstName: string,
  lastName: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

function normalizeStatusFilter(
  value: string | undefined,
): ApplicantRequestStatusFilter | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim().toLowerCase();
  if (
    APPLICANT_REQUEST_STATUS_FILTERS.includes(
      normalized as ApplicantRequestStatusFilter,
    )
  ) {
    return normalized as ApplicantRequestStatusFilter;
  }

  throw new ValidationDomainException('Request validation failed', {
    field: 'status',
    allowedValues: [...APPLICANT_REQUEST_STATUS_FILTERS],
  });
}

function normalizeRequiredText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      maxLength,
    });
  }

  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      maxLength,
    });
  }

  return normalized;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(
  value: number | undefined,
  field: string,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;

  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      minimum: 1,
    });
  }

  return value;
}

function normalizeOptionalDate(
  value: string | null | undefined,
  field: string,
): Date | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      format: 'YYYY-MM-DD',
    });
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new ValidationDomainException('Request validation failed', {
      field,
      format: 'YYYY-MM-DD',
    });
  }

  return parsed;
}
