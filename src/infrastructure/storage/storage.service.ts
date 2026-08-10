import { Inject, Injectable } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { Readable } from 'node:stream';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
  type ObjectStorageSignedCapability,
} from './object-storage.port';
import type { SignedGetDisposition } from './signed-url.service';
import { SignedUrlService } from './signed-url.service';

@Injectable()
export class StorageService {
  constructor(
    @Inject(OBJECT_STORAGE_PORT)
    private readonly objectStorage: ObjectStoragePort,
    private readonly signedUrlService: SignedUrlService,
  ) {}

  async saveObject(input: {
    objectKey: string;
    body: Buffer | string | Readable;
    sizeBytes?: number;
    visibility?: FileVisibility;
    bucket?: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ bucket: string; etag: string }> {
    const bucket =
      input.bucket ??
      this.signedUrlService.resolveBucket(
        input.visibility ?? FileVisibility.PRIVATE,
      );

    const result = await this.objectStorage.putObject({
      bucket,
      objectKey: input.objectKey,
      body: input.body,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
      metadata: input.metadata,
    });

    return {
      bucket,
      etag: result.etag,
    };
  }

  deleteObject(input: { bucket: string; objectKey: string }): Promise<void> {
    return this.objectStorage.deleteObject(input);
  }

  createDownloadUrl(input: {
    objectKey: string;
    bucket?: string;
    visibility?: FileVisibility;
    expiresInSeconds?: number;
    disposition?: SignedGetDisposition;
    contentType?: string;
    downloadFileName?: string | null;
  }): Promise<ObjectStorageSignedCapability> {
    return this.signedUrlService.createDownloadUrl(input);
  }

  createUploadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<ObjectStorageSignedCapability> {
    return this.objectStorage.createSignedPutUrl(input);
  }

  statObject(input: { bucket: string; objectKey: string }) {
    return this.objectStorage.statObject(input);
  }

  getObject(input: { bucket: string; objectKey: string }) {
    return this.objectStorage.getObject(input);
  }

  objectExists(input: { bucket: string; objectKey: string }): Promise<boolean> {
    return this.objectStorage.objectExists(input);
  }

  async deleteObjectAndConfirmAbsent(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void> {
    if (await this.objectExists(input)) {
      await this.deleteObject(input);
    }
    if (await this.objectExists(input)) {
      throw new Error('storage_object_still_present');
    }
  }

  listObjectsPage(input: {
    bucket: string;
    prefix: string;
    cursor?: string;
    limit: number;
  }) {
    return this.objectStorage.listObjectsPage(input);
  }

  resolveBucket(visibility: FileVisibility): string {
    return this.signedUrlService.resolveBucket(visibility);
  }

  async checkReadiness(): Promise<void> {
    const privateBucket = this.signedUrlService.resolveBucket(
      FileVisibility.PRIVATE,
    );
    const publicBucket = this.signedUrlService.resolveBucket(
      FileVisibility.PUBLIC,
    );

    const bucketResults = await Promise.allSettled([
      this.objectStorage.isBucketAvailable(privateBucket),
      this.objectStorage.isBucketAvailable(publicBucket),
    ]);

    if (
      bucketResults.some(
        (result) => result.status !== 'fulfilled' || !result.value,
      )
    ) {
      throw new Error('storage_bucket_unavailable');
    }
  }
}
