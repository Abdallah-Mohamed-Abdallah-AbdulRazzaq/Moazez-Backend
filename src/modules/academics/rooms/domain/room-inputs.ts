import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

type LocalizedNameInput = {
  name?: string;
  nameAr?: string;
  nameEn?: string;
};

function trimOrUndefined(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCreateRoomNames(
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

export function resolveUpdateRoomNames(
  existing: { nameAr: string; nameEn: string },
  input: LocalizedNameInput,
): { nameAr: string; nameEn: string } {
  const fallback = trimOrUndefined(input.name);
  return {
    nameAr: trimOrUndefined(input.nameAr) ?? fallback ?? existing.nameAr,
    nameEn: trimOrUndefined(input.nameEn) ?? fallback ?? existing.nameEn,
  };
}

export function normalizeOptionalRoomValue(
  value?: string | null,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return trimOrUndefined(value) ?? null;
}
