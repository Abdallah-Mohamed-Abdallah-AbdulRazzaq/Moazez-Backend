import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface ResolvedPersonName {
  firstName: string;
  lastName: string;
  fullName: string;
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

function splitFullName(
  fullName: string,
  label: string,
): { firstName: string; lastName: string } {
  const parts = fullName.split(' ');

  if (parts.length < 2) {
    throw new ValidationDomainException(`${label} name must include at least two parts`, {
      field: 'name',
    });
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
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
  const split = fullName ? splitFullName(fullName, input.label) : null;

  const firstName = explicitFirstName ?? split?.firstName ?? fallbackFirstName;
  const lastName = explicitLastName ?? split?.lastName ?? fallbackLastName;

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
