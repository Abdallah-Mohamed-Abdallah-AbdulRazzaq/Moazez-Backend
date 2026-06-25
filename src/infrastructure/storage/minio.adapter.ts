import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BucketItemStat, Client } from 'minio';

type PutObjectInput = {
  bucket: string;
  objectKey: string;
  body: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
};

type PresignedGetUrlInput = {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
  responseHeaders?: Record<string, string>;
};

@Injectable()
export class MinioAdapter {
  private readonly client: Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint = new URL(
      this.configService.getOrThrow<string>('STORAGE_ENDPOINT'),
    );

    this.client = new Client({
      endPoint: endpoint.hostname,
      port: endpoint.port
        ? Number(endpoint.port)
        : endpoint.protocol === 'https:'
          ? 443
          : 80,
      useSSL: endpoint.protocol === 'https:',
      accessKey: this.configService.getOrThrow<string>('STORAGE_ACCESS_KEY'),
      secretKey: this.configService.getOrThrow<string>('STORAGE_SECRET_KEY'),
    });
  }

  async ensureBucketExists(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
    }
  }

  bucketExists(bucket: string): Promise<boolean> {
    return this.client.bucketExists(bucket);
  }

  async putObject(
    input: PutObjectInput,
  ): Promise<{ etag: string; versionId?: string }> {
    await this.ensureBucketExists(input.bucket);

    const metadata = {
      ...(input.contentType
        ? { 'Content-Type': input.contentType }
        : {}),
      ...(input.metadata ?? {}),
    };

    const size = Buffer.isBuffer(input.body)
      ? input.body.byteLength
      : Buffer.byteLength(input.body);

    const uploaded = await this.client.putObject(
      input.bucket,
      input.objectKey,
      input.body,
      size,
      metadata,
    );

    return {
      etag: uploaded.etag,
      versionId: uploaded.versionId ?? undefined,
    };
  }

  async removeObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void> {
    await this.client.removeObject(input.bucket, input.objectKey);
  }

  statObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<BucketItemStat> {
    return this.client.statObject(input.bucket, input.objectKey);
  }

  createPresignedGetUrl(input: PresignedGetUrlInput): Promise<string> {
    return this.client.presignedGetObject(
      input.bucket,
      input.objectKey,
      input.expiresInSeconds,
      input.responseHeaders,
    );
  }
}
