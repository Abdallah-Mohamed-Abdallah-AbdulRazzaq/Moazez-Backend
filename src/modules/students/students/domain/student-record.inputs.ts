import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  ResolvedPersonName,
  normalizeOptionalText,
  resolvePersonName,
} from './person-name.helper';

type StudentNameFields = {
  name?: string | null;
  full_name_en?: string | null;
  full_name_ar?: string | null;
  first_name_en?: string | null;
  first_name_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
};

export function resolveStudentName(
  fields: StudentNameFields,
  fallback?: { firstName: string; lastName: string },
): ResolvedPersonName {
  return resolvePersonName({
    firstName: fields.first_name_en ?? fields.first_name_ar,
    lastName: fields.family_name_en ?? fields.family_name_ar,
    fullName: fields.full_name_en ?? fields.name ?? fields.full_name_ar,
    fallbackFirstName: fallback?.firstName,
    fallbackLastName: fallback?.lastName,
    label: 'student',
  });
}

export function resolveStudentBirthDate(
  dateOfBirth?: string | null,
  legacyDateOfBirth?: string | null,
  fallback?: Date | null,
): Date | null {
  const normalizedDateOfBirth = normalizeOptionalText(dateOfBirth);
  const normalizedLegacyDateOfBirth = normalizeOptionalText(legacyDateOfBirth);

  if (
    normalizedDateOfBirth &&
    normalizedLegacyDateOfBirth &&
    normalizedDateOfBirth !== normalizedLegacyDateOfBirth
  ) {
    throw new ValidationDomainException('Student birth date fields must match', {
      fields: ['dateOfBirth', 'date_of_birth'],
    });
  }

  const nextValue = normalizedDateOfBirth ?? normalizedLegacyDateOfBirth;
  if (!nextValue) {
    return fallback ?? null;
  }

  const parsed = new Date(`${nextValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationDomainException('Student birth date is invalid', {
      field: 'dateOfBirth',
    });
  }

  return parsed;
}
