import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  ResolvedPersonName,
  normalizeOptionalText,
  resolvePersonName,
} from '../../students/domain/person-name.helper';

type GuardianNameFields = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export function resolveGuardianName(
  fields: GuardianNameFields,
  fallback?: { firstName: string; lastName: string },
): ResolvedPersonName {
  return resolvePersonName({
    firstName: fields.first_name,
    lastName: fields.last_name,
    fullName: fields.full_name,
    fallbackFirstName: fallback?.firstName,
    fallbackLastName: fallback?.lastName,
    label: 'guardian',
  });
}

export function resolveGuardianRelation(
  relation?: string | null,
  fallback?: string | null,
): string {
  const normalizedRelation = normalizeOptionalText(relation);
  const normalizedFallback = normalizeOptionalText(fallback);

  if (normalizedRelation) {
    return normalizedRelation.toLowerCase();
  }

  if (normalizedFallback) {
    return normalizedFallback.toLowerCase();
  }

  throw new ValidationDomainException('Guardian relation is required', {
    field: 'relation',
  });
}

export function resolveGuardianPhone(
  phone?: string | null,
  fallback?: string | null,
): string {
  const normalizedPhone = normalizeOptionalText(phone);
  const normalizedFallback = normalizeOptionalText(fallback);

  if (normalizedPhone) {
    return normalizedPhone;
  }

  if (normalizedFallback) {
    return normalizedFallback;
  }

  throw new ValidationDomainException('Guardian phone is required', {
    field: 'phone_primary',
  });
}

export function resolveGuardianEmail(
  email?: string | null,
  fallback?: string | null,
): string | null {
  return normalizeOptionalText(email) ?? normalizeOptionalText(fallback);
}
