import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface ResolvedPersonName {
  firstName: string;
  lastName: string;
  fullName: string;
}

export interface ParsedPersonNameParts {
  firstName: string | null;
  fatherName: string | null;
  grandfatherName: string | null;
  familyName: string | null;
}

type ResolvePersonNameInput = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  fallbackFirstName?: string;
  fallbackLastName?: string;
  label: string;
};

export function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}

export function parseOptionalPersonNameParts(
  value?: string | null,
): ParsedPersonNameParts | null {
  const fullName = normalizeOptionalText(value);
  if (!fullName) {
    return null;
  }

  const parts = fullName.split(' ');
  const [firstName] = parts;
  const familyName =
    parts.length >= 4
      ? parts.slice(3).join(' ')
      : parts.length >= 2
        ? parts[parts.length - 1]
        : null;

  return {
    firstName: firstName ?? null,
    fatherName: parts.length >= 3 ? parts[1] : null,
    grandfatherName: parts.length >= 4 ? parts[2] : null,
    familyName,
  };
}

export function resolvePersonName(
  input: ResolvePersonNameInput,
): ResolvedPersonName {
  const explicitFirstName = normalizeOptionalText(input.firstName);
  const explicitLastName = normalizeOptionalText(input.lastName);
  const fullName = normalizeOptionalText(input.fullName);
  const fallbackFirstName = normalizeOptionalText(input.fallbackFirstName);
  const fallbackLastName = normalizeOptionalText(input.fallbackLastName);
  const split = parseOptionalPersonNameParts(fullName);

  if (fullName && (!split?.firstName || !split.familyName)) {
    throw new ValidationDomainException(
      `${input.label} name must include at least two parts`,
      {
        field: 'name',
      },
    );
  }

  const firstName = explicitFirstName ?? split?.firstName ?? fallbackFirstName;
  const lastName = explicitLastName ?? split?.familyName ?? fallbackLastName;

  if (!firstName || !lastName) {
    throw new ValidationDomainException(
      `${input.label} first and last name are required`,
      {
        field: 'name',
      },
    );
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
  };
}
