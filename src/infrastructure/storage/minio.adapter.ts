import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { BucketItem, BucketItemStat, Client } from 'minio';

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
      ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
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

  getObject(input: { bucket: string; objectKey: string }): Promise<Readable> {
    return this.client.getObject(input.bucket, input.objectKey);
  }

  listObjectsPage(input: {
    bucket: string;
    prefix: string;
    startAfter?: string;
    limit: number;
  }): Promise<{
    objects: Array<{ objectKey: string; size: number; lastModified: Date }>;
    nextStartAfter: string | null;
  }> {
    return new Promise((resolve, reject) => {
      const objects: Array<{
        objectKey: string;
        size: number;
        lastModified: Date;
      }> = [];
      let settled = false;
      const stream = this.client.listObjectsV2(
        input.bucket,
        input.prefix,
        true,
        input.startAfter,
      );

      stream.on('data', (item: BucketItem) => {
        if (settled || !item.name) return;
        if (objects.length < input.limit) {
          objects.push({
            objectKey: item.name,
            size: item.size,
            lastModified: item.lastModified,
          });
          return;
        }

        settled = true;
        stream.destroy();
        resolve({
          objects,
          nextStartAfter: objects[objects.length - 1]?.objectKey ?? null,
        });
      });
      stream.on('error', (error) => {
        if (!settled) reject(error);
      });
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ objects, nextStartAfter: null });
      });
    });
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
