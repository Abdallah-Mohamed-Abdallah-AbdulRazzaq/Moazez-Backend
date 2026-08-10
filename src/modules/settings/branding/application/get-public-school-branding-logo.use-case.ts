import { Injectable, Logger } from '@nestjs/common';
import { PassThrough, Readable } from 'node:stream';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  PublicBrandingLogoNotFoundException,
  PublicBrandingLogoServiceUnavailableException,
} from '../domain/branding-logo.errors';
import type { PublicBrandingLogoStream } from '../domain/branding-logo.types';
import { ResolveSchoolLogoUrlService } from './resolve-school-logo-url.service';

const STREAM_INITIALIZATION_TIMEOUT_MS = 10_000;

@Injectable()
export class GetPublicSchoolBrandingLogoUseCase {
  private readonly logger = new Logger(GetPublicSchoolBrandingLogoUseCase.name);

  constructor(
    private readonly resolver: ResolveSchoolLogoUrlService,
    private readonly storageService: StorageService,
  ) {}

  async execute(schoolId: string): Promise<PublicBrandingLogoStream> {
    const file = await this.resolver.findEligibleManagedFile(schoolId);
    if (!file) throw new PublicBrandingLogoNotFoundException();

    let stat: Awaited<ReturnType<StorageService['statObject']>>;
    try {
      stat = await this.storageService.statObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
    } catch (error: unknown) {
      this.handleStorageFailure(error);
    }

    if (
      stat.size !== Number(file.sizeBytes) ||
      stat.contentType !== file.mimeType
    ) {
      throw new PublicBrandingLogoNotFoundException();
    }

    let stream: Readable;
    try {
      const source = await this.storageService.getObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
      stream = await this.createByteIntegrityStream(
        source,
        Number(file.sizeBytes),
      );
    } catch (error: unknown) {
      this.handleStorageFailure(error);
    }

    return {
      stream,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
    };
  }

  private handleStorageFailure(error: unknown): never {
    if (isObjectStorageNotFoundError(error)) {
      throw new PublicBrandingLogoNotFoundException();
    }
    this.logger.error({ event: 'branding.logo.public.storage_unavailable' });
    throw new PublicBrandingLogoServiceUnavailableException(error);
  }

  private async createByteIntegrityStream(
    source: Readable,
    expectedBytes: number,
  ): Promise<Readable> {
    const iterator = source[Symbol.asyncIterator]();
    const first = await this.readFirstChunk(source, iterator);
    if (first.byteLength > expectedBytes) {
      await iterator.return?.();
      throw new Error('storage_stream_byte_count_exceeded');
    }

    const validatedSource = Readable.from(
      this.iterateValidatedBytes(iterator, first, expectedBytes),
    );
    const output = new PassThrough();
    validatedSource.once('error', (error) => output.destroy(error));
    output.once('close', () => {
      if (output.readableEnded) return;
      if (!source.destroyed) source.destroy();
      if (!validatedSource.destroyed) validatedSource.destroy();
    });
    validatedSource.pipe(output);
    return output;
  }

  private async readFirstChunk(
    source: Readable,
    iterator: AsyncIterator<unknown>,
  ): Promise<Buffer> {
    while (true) {
      let timeout: NodeJS.Timeout | undefined;
      try {
        const result = await Promise.race([
          iterator.next(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              source.destroy();
              reject(new Error('storage_stream_initialization_timeout'));
            }, STREAM_INITIALIZATION_TIMEOUT_MS);
          }),
        ]);
        if (result.done) {
          throw new Error('storage_stream_ended_before_first_byte');
        }
        const chunk = Buffer.from(result.value as Uint8Array);
        if (chunk.byteLength > 0) return chunk;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  }

  private async *iterateValidatedBytes(
    iterator: AsyncIterator<unknown>,
    first: Buffer,
    expectedBytes: number,
  ): AsyncGenerator<Buffer> {
    let streamedBytes = first.byteLength;
    let completed = false;
    try {
      yield first;

      while (true) {
        const result = await iterator.next();
        if (result.done) break;
        const chunk = Buffer.from(result.value as Uint8Array);
        if (streamedBytes + chunk.byteLength > expectedBytes) {
          throw new Error('storage_stream_byte_count_exceeded');
        }
        streamedBytes += chunk.byteLength;
        if (chunk.byteLength > 0) yield chunk;
      }

      if (streamedBytes !== expectedBytes) {
        throw new Error('storage_stream_byte_count_short');
      }
      completed = true;
    } finally {
      if (!completed) await iterator.return?.();
    }
  }
}
