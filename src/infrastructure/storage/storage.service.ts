import { Injectable } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { MinioAdapter } from './minio.adapter';
import { SignedUrlService } from './signed-url.service';

@Injectable()
export class StorageService {
  constructor(
    private readonly minioAdapter: MinioAdapter,
    private readonly signedUrlService: SignedUrlService,
  ) {}

  async saveObject(input: {
    objectKey: string;
    body: Buffer | string;
    visibility?: FileVisibility;
    bucket?: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ bucket: string; etag: string }> {
    const bucket =
      input.bucket ?? this.signedUrlService.resolveBucket(
        input.visibility ?? FileVisibility.PRIVATE,
      );

    const result = await this.minioAdapter.putObject({
      bucket,
      objectKey: input.objectKey,
      body: input.body,
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
    downloadFileName?: string | null;
  }): Promise<string> {
    return this.signedUrlService.createDownloadUrl(input);
  }

  statObject(input: {
    bucket: string;
    objectKey: string;
  }) {
    return this.minioAdapter.statObject(input);
  }

  async checkReadiness(): Promise<void> {
    const privateBucket = this.signedUrlService.resolveBucket(
      FileVisibility.PRIVATE,
    );
    const publicBucket = this.signedUrlService.resolveBucket(
      FileVisibility.PUBLIC,
    );

    const [privateExists, publicExists] = await Promise.all([
      this.minioAdapter.bucketExists(privateBucket),
      this.minioAdapter.bucketExists(publicBucket),
    ]);

    if (!privateExists || !publicExists) {
      throw new Error('storage_bucket_unavailable');
    }
  }
}
