import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { BucketItem, BucketItemStat, Client } from 'minio';

type PutObjectInput = {
  bucket: string;
  objectKey: string;
  body: Buffer | string | Readable;
  sizeBytes?: number;
  contentType?: string;
  metadata?: Record<string, string>;
};

type PresignedGetUrlInput = {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
  responseHeaders?: Record<string, string>;
};

type PresignedPutUrlInput = {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
};

export type PresignedPutCapability = {
  url: string;
  expiresAt: Date;
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

    const size =
      input.body instanceof Readable
        ? input.sizeBytes
        : Buffer.isBuffer(input.body)
          ? input.body.byteLength
          : Buffer.byteLength(input.body);
    if (size === undefined || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('storage_object_size_required');
    }

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

  async createPresignedPutUrl(
    input: PresignedPutUrlInput,
  ): Promise<PresignedPutCapability> {
    await this.ensureBucketExists(input.bucket);
    const url = await this.client.presignedPutObject(
      input.bucket,
      input.objectKey,
      input.expiresInSeconds,
    );
    return { url, expiresAt: parsePresignedPutExpiry(url) };
  }

  async objectExists(input: {
    bucket: string;
    objectKey: string;
  }): Promise<boolean> {
    try {
      await this.client.statObject(input.bucket, input.objectKey);
      return true;
    } catch (error) {
      const code = isStorageError(error) ? String(error.code) : '';
      if (['NoSuchKey', 'NoSuchObject', 'NotFound'].includes(code)) {
        return false;
      }
      throw error;
    }
  }
}

function isStorageError(error: unknown): error is { code: unknown } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function parsePresignedPutExpiry(value: string): Date {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('storage_presigned_put_url_invalid');
  }
  const signedAt = url.searchParams.get('X-Amz-Date');
  const expiresText = url.searchParams.get('X-Amz-Expires');
  if (!signedAt || !/^\d{8}T\d{6}Z$/u.test(signedAt) || !expiresText) {
    throw new Error('storage_presigned_put_expiry_missing');
  }
  const expiresInSeconds = Number(expiresText);
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('storage_presigned_put_expiry_invalid');
  }
  const signedAtMilliseconds = Date.UTC(
    Number(signedAt.slice(0, 4)),
    Number(signedAt.slice(4, 6)) - 1,
    Number(signedAt.slice(6, 8)),
    Number(signedAt.slice(9, 11)),
    Number(signedAt.slice(11, 13)),
    Number(signedAt.slice(13, 15)),
  );
  if (!Number.isFinite(signedAtMilliseconds)) {
    throw new Error('storage_presigned_put_expiry_invalid');
  }
  return new Date(signedAtMilliseconds + expiresInSeconds * 1000);
}
