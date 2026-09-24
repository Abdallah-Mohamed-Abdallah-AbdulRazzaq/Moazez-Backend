import type { Readable } from 'node:stream';
import {
  ObjectStorageError,
  normalizeObjectStorageReadStream,
} from './object-storage.errors';

export async function collectObjectRange(
  source: Readable,
  length: number,
  provider: 'gcs' | 'minio',
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const normalized = normalizeObjectStorageReadStream(source, provider);

  for await (const chunk of normalized as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array) && typeof chunk !== 'string') {
      throw new ObjectStorageError('unknown');
    }
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    if (bytes.byteLength > length - total) {
      throw new ObjectStorageError('unknown');
    }
    chunks.push(Buffer.from(bytes));
    total += bytes.byteLength;
  }

  return Buffer.concat(chunks, total);
}
