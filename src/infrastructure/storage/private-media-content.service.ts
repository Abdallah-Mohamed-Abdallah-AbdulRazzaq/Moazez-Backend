import { HttpStatus, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  DomainException,
  NotFoundDomainException,
} from '../../common/exceptions/domain-exception';
import { isObjectStorageNotFoundError } from './object-storage.errors';
import { StorageService } from './storage.service';

// Internal contract: only resource-authorized callers may supply this descriptor.
export interface PrivateMediaFileDescriptor {
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint | number;
}

export interface PrivateMediaContent {
  stream: Readable;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

const STREAM_INITIALIZATION_TIMEOUT_MS = 10_000;

function serviceUnavailable(): DomainException {
  return new DomainException({
    code: 'service_unavailable',
    message: 'Service temporarily unavailable',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
  });
}

@Injectable()
export class PrivateMediaContentService {
  constructor(private readonly storageService: StorageService) {}

  async open(
    file: PrivateMediaFileDescriptor,
    notFound: () => DomainException = () => new NotFoundDomainException(),
  ): Promise<PrivateMediaContent> {
    const sizeBytes = Number(file.sizeBytes);
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0 ||
      !file.mimeType ||
      /[\r\n]/u.test(file.mimeType)
    ) {
      throw notFound();
    }

    const location = { bucket: file.bucket, objectKey: file.objectKey };
    let source: Readable | undefined;
    let stream: Readable;
    try {
      const stat = await this.storageService.statObject(location);
      if (stat.size !== sizeBytes) throw notFound();
      source = await this.storageService.getObject(location);
      const iterator = source[Symbol.asyncIterator]();
      let timeout: NodeJS.Timeout | undefined;
      let first: IteratorResult<unknown>;
      try {
        // Provider read errors must be classified before committing HTTP 200.
        first = await Promise.race([
          iterator.next(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              source?.destroy();
              reject(serviceUnavailable());
            }, STREAM_INITIALIZATION_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      if (first.done && sizeBytes !== 0) throw notFound();
      if (!first.done && this.chunkSize(first.value) > sizeBytes) {
        throw notFound();
      }

      stream = Readable.from(this.validateBytes(iterator, first, sizeBytes), {
        objectMode: false,
      });
      stream.once('close', () => {
        if (source && !source.destroyed) source.destroy();
      });
    } catch (error: unknown) {
      if (source && !source.destroyed) source.destroy();
      if (error instanceof DomainException) throw error;
      if (isObjectStorageNotFoundError(error)) throw notFound();
      throw serviceUnavailable();
    }

    return {
      stream,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes,
    };
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
        yield current.value as Uint8Array;
        current = await iterator.next();
      }
      if (bytes !== expectedBytes) throw serviceUnavailable();
    } catch {
      // Late failures terminate the response; provider details never escape.
      throw serviceUnavailable();
    } finally {
      await iterator.return?.();
    }
  }
}
