import { createHash } from 'node:crypto';
import type { ObjectStorageStat } from './object-storage.port';

export function storageObjectIdentity(stat: ObjectStorageStat): string | null {
  if (!stat.etag && !stat.generation && !stat.version) return null;
  return createHash('sha256')
    .update(
      JSON.stringify([
        stat.generation,
        stat.version,
        stat.etag,
        stat.size,
        stat.contentType,
      ]),
    )
    .digest('hex');
}
