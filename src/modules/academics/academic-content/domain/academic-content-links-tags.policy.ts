import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export type AcademicContentLinkInput = { label: string; url: string };
export type AcademicContentTagInput = { value: string };
export type NormalizedAcademicContentLink = AcademicContentLinkInput & {
  sortOrder: number;
};
export type NormalizedAcademicContentTag = {
  displayValue: string;
  normalizedValue: string;
  sortOrder: number;
};

export function normalizeAcademicContentLinks(
  input: readonly AcademicContentLinkInput[],
): NormalizedAcademicContentLink[] {
  if (!Array.isArray(input as unknown) || input.length > 100)
    throw new ValidationDomainException('Invalid Academic Content links');
  return input.map((entry, sortOrder) => {
    if (
      !entry ||
      typeof entry.label !== 'string' ||
      typeof entry.url !== 'string'
    )
      throw new ValidationDomainException('Invalid Academic Content link');
    const label = entry.label.trim();
    const url = entry.url.trim();
    if (!label || label.length > 180 || !url || url.length > 2048)
      throw new ValidationDomainException('Invalid Academic Content link');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationDomainException('Invalid Academic Content link URL');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    )
      throw new ValidationDomainException('Invalid Academic Content link URL');
    return { label, url, sortOrder };
  });
}

export function normalizeAcademicContentTags(
  input: readonly AcademicContentTagInput[],
): NormalizedAcademicContentTag[] {
  if (!Array.isArray(input as unknown) || input.length > 100)
    throw new ValidationDomainException('Invalid Academic Content tags');
  const seen = new Set<string>();
  return input.map((entry, sortOrder) => {
    if (!entry || typeof entry.value !== 'string')
      throw new ValidationDomainException('Invalid Academic Content tag');
    const displayValue = entry.value
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ');
    const normalizedValue = displayValue.toLowerCase();
    if (
      !displayValue ||
      displayValue.length > 80 ||
      normalizedValue.length > 80 ||
      seen.has(normalizedValue)
    )
      throw new ValidationDomainException(
        'Invalid or duplicate Academic Content tag',
      );
    seen.add(normalizedValue);
    return { displayValue, normalizedValue, sortOrder };
  });
}
