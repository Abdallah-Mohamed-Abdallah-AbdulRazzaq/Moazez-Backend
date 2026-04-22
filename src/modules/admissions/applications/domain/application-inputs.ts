import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export function normalizeRequiredApplicationText(
  value: string,
  field: string,
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ValidationDomainException(`${field} is required`, { field });
  }

  return normalized;
}
