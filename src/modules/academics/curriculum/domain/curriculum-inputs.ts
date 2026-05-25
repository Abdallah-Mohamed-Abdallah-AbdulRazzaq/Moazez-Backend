export function normalizeRequiredTitle(value: string): string {
  return value.trim();
}

export function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeOptionalObjectives(
  value: string[] | null | undefined,
): string[] | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : null;
}
