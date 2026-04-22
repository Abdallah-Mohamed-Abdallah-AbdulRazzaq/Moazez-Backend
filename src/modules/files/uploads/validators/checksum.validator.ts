export function normalizeChecksumSha256(
  checksumSha256?: string | null,
): string | null {
  const normalized = checksumSha256?.trim().toLowerCase() ?? '';
  if (normalized.length === 0) {
    return null;
  }

  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}
