import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DomainException,
  NotFoundDomainException,
} from '../../common/exceptions/domain-exception';
import { isObjectStorageNotFoundError } from './object-storage.errors';
import {
  resolvePrivateMediaRange,
  type PrivateMediaByteRange,
} from './private-media-range';
import { StorageService } from './storage.service';

// Internal contract: only resource-authorized callers may supply this descriptor.
export interface PrivateMediaFileDescriptor {
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint | number;
}
export interface PrivateMediaContentRequest {
  range?: string;
  ifRange?: string;
  head?: boolean;
  signal?: AbortSignal;
  disposition?: 'attachment' | 'inline';
  beforeRead?: () => Promise<void>;
}
export interface PrivateMediaContent {
  stream: Readable;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  totalSizeBytes: number;
  statusCode: 200 | 206 | 416;
  range?: PrivateMediaByteRange;
  etag?: string;
  head?: boolean;
}
const STREAM_INITIALIZATION_TIMEOUT_MS = 10_000;
const SAFE_INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
]);
function serviceUnavailable(): DomainException {
  return new DomainException({
    code: 'service_unavailable',
    message: 'Service temporarily unavailable',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
  });
}
function responseMime(
  file: PrivateMediaFileDescriptor,
  inline: boolean,
): string {
  const value = file.mimeType.trim().toLowerCase();
  const valid = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(value);
  if (inline && (!valid || !SAFE_INLINE_MIME_TYPES.has(value)))
    throw new DomainException({
      code: 'forbidden',
      message: 'Inline preview is unavailable',
      httpStatus: HttpStatus.FORBIDDEN,
    });
  return valid ? value : 'application/octet-stream';
}
@Injectable()
export class PrivateMediaContentService {
  constructor(private readonly storageService: StorageService) {}
  async openAuthorized(
    resolve: () => Promise<PrivateMediaFileDescriptor>,
    notFound: () => DomainException,
    request: PrivateMediaContentRequest = {},
  ): Promise<PrivateMediaContent> {
    const file = await resolve();
    return this.open(file, notFound, {
      ...request,
      beforeRead: async () => {
        const current = await resolve();
        if (
          current.bucket !== file.bucket ||
          current.objectKey !== file.objectKey ||
          current.mimeType !== file.mimeType ||
          current.originalName !== file.originalName ||
          current.sizeBytes !== file.sizeBytes
        )
          throw notFound();
      },
    });
  }
  async open(
    file: PrivateMediaFileDescriptor,
    notFound: () => DomainException = () => new NotFoundDomainException(),
    request: PrivateMediaContentRequest = {},
  ): Promise<PrivateMediaContent> {
    const totalSizeBytes = Number(file.sizeBytes);
    if (
      !Number.isSafeInteger(totalSizeBytes) ||
      totalSizeBytes < 0 ||
      !file.bucket ||
      !file.objectKey
    )
      throw notFound();
    const mimeType = responseMime(file, request.disposition === 'inline');
    const location = { bucket: file.bucket, objectKey: file.objectKey };
    let source: Readable | undefined;
    let stream: Readable | undefined;
    let initializationFinished = false;
    let timeout: NodeJS.Timeout | undefined;
    let rejectInitialization: ((error: DomainException) => void) | undefined;
    const abort = () => {
      source?.destroy();
      stream?.destroy();
    };
    const cancelled = () => {
      abort();
      rejectInitialization?.(serviceUnavailable());
    };
    const failure = new Promise<never>((_resolve, reject) => {
      rejectInitialization = reject;
      timeout = setTimeout(() => {
        abort();
        reject(serviceUnavailable());
      }, STREAM_INITIALIZATION_TIMEOUT_MS);
    });
    request.signal?.addEventListener('abort', cancelled, { once: true });
    const bounded = <T>(operation: Promise<T>) =>
      Promise.race([operation, failure]);
    try {
      if (request.signal?.aborted) throw serviceUnavailable();
      const stat = await bounded(this.storageService.statObject(location));
      if (stat.size !== totalSizeBytes) throw notFound();
      const etag =
        stat.generation || stat.version || stat.etag
          ? '"' +
            createHash('sha256')
              .update(
                JSON.stringify([
                  stat.generation,
                  stat.version,
                  stat.etag,
                  stat.size,
                ]),
              )
              .digest('hex') +
            '"'
          : undefined;
      const useRange =
        !request.head &&
        request.range !== undefined &&
        (request.ifRange === undefined ||
          (etag !== undefined && request.ifRange === etag));
      const range = useRange
        ? resolvePrivateMediaRange(request.range!, totalSizeBytes)
        : undefined;
      const statusCode: 200 | 206 | 416 =
        useRange && range === null ? 416 : range ? 206 : 200;
      const sizeBytes =
        statusCode === 416 ? 0 : (range?.length ?? totalSizeBytes);
      const result = {
        originalName: file.originalName,
        mimeType,
        sizeBytes,
        totalSizeBytes,
        statusCode,
        ...(range ? { range } : {}),
        ...(etag ? { etag } : {}),
        ...(request.head ? { head: true } : {}),
      };
      if (request.head || statusCode === 416) {
        if (request.beforeRead) await bounded(request.beforeRead());
        if (request.signal?.aborted) throw serviceUnavailable();
        stream = Readable.from([]);
        return { ...result, stream };
      }
      const pendingSource = this.storageService.getObject({
        ...location,
        raw: true,
        ...(stat.generation ? { generation: stat.generation } : {}),
        ...(stat.version ? { version: stat.version } : {}),
        ...(range ? { range } : {}),
      });
      // Late provider resolution after initialization failure must be destroyed.
      void pendingSource.then(
        (late) => {
          if (request.signal?.aborted || initializationFinished) late.destroy();
        },
        () => undefined,
      );
      source = await bounded(pendingSource);
      const iterator = source[Symbol.asyncIterator]();
      let first = await bounded(iterator.next());
      while (!first.done && this.chunkSize(first.value) === 0)
        first = await bounded(iterator.next());
      if (first.done && sizeBytes !== 0) throw notFound();
      if (!first.done && this.chunkSize(first.value) > sizeBytes)
        throw notFound();
      // Unversioned providers cannot pin a read. Confirm that the object did not
      // change between stat and the GET snapshot before committing HTTP headers.
      if (!stat.generation && !stat.version && stat.etag) {
        const current = await bounded(this.storageService.statObject(location));
        if (
          current.size !== stat.size ||
          current.etag !== stat.etag ||
          current.generation !== stat.generation ||
          current.version !== stat.version
        )
          throw notFound();
      }
      if (request.beforeRead) await bounded(request.beforeRead());
      if (request.signal?.aborted) throw serviceUnavailable();
      stream = Readable.from(this.validateBytes(iterator, first, sizeBytes), {
        objectMode: false,
        highWaterMark: 64 * 1024,
      });
      stream.once('close', () => {
        if (source && !source.destroyed) source.destroy();
        request.signal?.removeEventListener('abort', cancelled);
      });
      return { ...result, stream };
    } catch (error: unknown) {
      abort();
      request.signal?.removeEventListener('abort', cancelled);
      if (error instanceof DomainException) throw error;
      if (isObjectStorageNotFoundError(error)) throw notFound();
      throw serviceUnavailable();
    } finally {
      initializationFinished = true;
      if (timeout) clearTimeout(timeout);
      rejectInitialization = undefined;
      if (!source) request.signal?.removeEventListener('abort', cancelled);
    }
  }
  private chunkSize(chunk: unknown): number {
    if (!(chunk instanceof Uint8Array)) throw serviceUnavailable();
    return chunk.byteLength;
  }
  private async *validateBytes(
    iterator: AsyncIterator<unknown>,
    first: IteratorResult<unknown>,
    expectedBytes: number,
  ): AsyncGenerator<Uint8Array> {
    let bytes = 0;
    let current = first;
    try {
      while (!current.done) {
        bytes += this.chunkSize(current.value);
        if (bytes > expectedBytes) throw serviceUnavailable();
        // Hold the final chunk until EOF so excess bytes or a late provider
        // failure cannot look successful merely because Content-Length arrived.
        if (bytes === expectedBytes) {
          const end = await iterator.next();
          if (!end.done) throw serviceUnavailable();
          yield current.value as Uint8Array;
          return;
        }
        yield current.value as Uint8Array;
        current = await iterator.next();
      }
      if (bytes !== expectedBytes) throw serviceUnavailable();
    } catch {
      throw serviceUnavailable();
    } finally {
      await iterator.return?.();
    }
  }
}
