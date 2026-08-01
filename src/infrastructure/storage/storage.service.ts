import { Injectable } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { Readable } from 'node:stream';
import {
  MinioAdapter,
  type PresignedGetCapability,
  type PresignedPutCapability,
} from './minio.adapter';
import type { SignedGetDisposition } from './signed-url.service';
import { SignedUrlService } from './signed-url.service';

@Injectable()
export class StorageService {
  constructor(
    private readonly minioAdapter: MinioAdapter,
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

    const result = await this.minioAdapter.putObject({
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
    return this.minioAdapter.removeObject(input);
  }

  createDownloadUrl(input: {
    objectKey: string;
    bucket?: string;
    visibility?: FileVisibility;
    expiresInSeconds?: number;
    disposition?: SignedGetDisposition;
    contentType?: string;
    downloadFileName?: string | null;
  }): Promise<PresignedGetCapability> {
    return this.signedUrlService.createDownloadUrl(input);
  }

  createUploadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<PresignedPutCapability> {
    return this.minioAdapter.createPresignedPutUrl(input);
  }

  statObject(input: { bucket: string; objectKey: string }) {
    return this.minioAdapter.statObject(input);
  }

  getObject(input: { bucket: string; objectKey: string }) {
    return this.minioAdapter.getObject(input);
  }

  objectExists(input: { bucket: string; objectKey: string }): Promise<boolean> {
    return this.minioAdapter.objectExists(input);
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
    startAfter?: string;
    limit: number;
  }) {
    return this.minioAdapter.listObjectsPage(input);
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
      this.minioAdapter.bucketExistsForReadiness(privateBucket),
      this.minioAdapter.bucketExistsForReadiness(publicBucket),
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
