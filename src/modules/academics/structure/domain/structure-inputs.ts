import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

type LocalizedNameInput = {
  name?: string;
  nameAr?: string;
  nameEn?: string;
};

function trimOrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCreateLocalizedNames(
  input: LocalizedNameInput,
): { nameAr: string; nameEn: string } {
  const fallback = trimOrUndefined(input.name);
  const nameAr = trimOrUndefined(input.nameAr) ?? fallback;
  const nameEn = trimOrUndefined(input.nameEn) ?? fallback;

  if (!nameAr || !nameEn) {
    throw new ValidationDomainException('Localized name fields are required', {
      fields: ['nameAr', 'nameEn'],
    });
  }

  return { nameAr, nameEn };
}

export function resolveUpdateLocalizedNames(
  existing: { nameAr: string; nameEn: string },
  input: LocalizedNameInput,
): { nameAr: string; nameEn: string } {
  const fallback = trimOrUndefined(input.name);
  return {
    nameAr: trimOrUndefined(input.nameAr) ?? fallback ?? existing.nameAr,
    nameEn: trimOrUndefined(input.nameEn) ?? fallback ?? existing.nameEn,
  };
}

export function resolveSortOrder(
  input: { sortOrder?: number; order?: number },
  fallback?: number,
): number | undefined {
  return input.sortOrder ?? input.order ?? fallback;
}

export function resolveTermIsActive(
  input: { isActive?: boolean; status?: 'open' | 'closed' },
  fallback?: boolean,
): boolean | undefined {
  if (typeof input.isActive === 'boolean') {
    return input.isActive;
  }

  if (input.status) {
    return input.status === 'open';
  }

  return fallback;
}

export function parseDateOnly(value: string): Date {
  return new Date(value);
}
