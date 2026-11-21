import { createHash } from 'node:crypto';

export function resultContentDigest(value: unknown): string {
  const serialized = JSON.stringify(value, (_key: string, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
  return createHash('sha256').update(serialized).digest('hex');
}
