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

type GuardianProfileFields = GuardianNameFields & {
  phone_secondary?: string | null;
  national_id?: string | null;
  job_title?: string | null;
  workplace?: string | null;
  can_pickup?: boolean | null;
  can_receive_notifications?: boolean | null;
};

export interface ResolvedGuardianProfileFields {
  phoneSecondary: string | null;
  nationalId: string | null;
  jobTitle: string | null;
  workplace: string | null;
  canPickup: boolean | null;
  canReceiveNotifications: boolean | null;
}

type GuardianProfilePatch = Partial<ResolvedGuardianProfileFields>;

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

export function resolveGuardianProfileFields(
  fields: GuardianProfileFields,
): ResolvedGuardianProfileFields {
  return {
    phoneSecondary: normalizeOptionalText(fields.phone_secondary),
    nationalId: normalizeOptionalText(fields.national_id),
    jobTitle: normalizeOptionalText(fields.job_title),
    workplace: normalizeOptionalText(fields.workplace),
    canPickup: fields.can_pickup ?? null,
    canReceiveNotifications: fields.can_receive_notifications ?? null,
  };
}

export function resolveGuardianProfilePatch(
  fields: GuardianProfileFields,
): GuardianProfilePatch {
  const patch: GuardianProfilePatch = {};

  if (fields.phone_secondary !== undefined) {
    patch.phoneSecondary = normalizeOptionalText(fields.phone_secondary);
  }

  if (fields.national_id !== undefined) {
    patch.nationalId = normalizeOptionalText(fields.national_id);
  }

  if (fields.job_title !== undefined) {
    patch.jobTitle = normalizeOptionalText(fields.job_title);
  }

  if (fields.workplace !== undefined) {
    patch.workplace = normalizeOptionalText(fields.workplace);
  }

  if (fields.can_pickup !== undefined) {
    patch.canPickup = fields.can_pickup;
  }

  if (fields.can_receive_notifications !== undefined) {
    patch.canReceiveNotifications = fields.can_receive_notifications;
  }

  return patch;
}
