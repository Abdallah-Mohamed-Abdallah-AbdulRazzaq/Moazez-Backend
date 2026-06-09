import { ValidationDomainException } from '../../../common/exceptions/domain-exception';

export const APPLICANT_RELATIONSHIPS = [
  'father',
  'mother',
  'guardian',
  'relative',
] as const;

export type ApplicantRelationship = (typeof APPLICANT_RELATIONSHIPS)[number];

export interface NormalizedApplicantProfileInput {
  fullName: string;
  phoneNumber: string | null;
  city: string | null;
  relationship: ApplicantRelationship;
}

export function normalizeApplicantProfileInput(input: {
  fullName: string;
  phoneNumber?: string | null;
  city?: string | null;
  relationship: string;
}): NormalizedApplicantProfileInput {
  return {
    fullName: normalizeRequiredText(input.fullName, 'fullName', 200),
    phoneNumber: normalizeOptionalText(input.phoneNumber, 'phoneNumber', 50),
    city: normalizeOptionalText(input.city, 'city', 120),
    relationship: normalizeApplicantRelationship(input.relationship),
  };
}

export function normalizeApplicantRelationship(
  relationship: string,
): ApplicantRelationship {
  const normalized = relationship.trim().toLowerCase();

  if (APPLICANT_RELATIONSHIPS.includes(normalized as ApplicantRelationship)) {
    return normalized as ApplicantRelationship;
  }

  throw new ValidationDomainException('Invalid applicant relationship', {
    field: 'relationship',
    allowedValues: [...APPLICANT_RELATIONSHIPS],
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
