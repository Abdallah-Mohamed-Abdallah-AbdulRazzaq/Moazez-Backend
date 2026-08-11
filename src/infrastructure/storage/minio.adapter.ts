import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Agent as HttpAgent,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
  request as httpRequest,
} from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { type BucketItem, type BucketItemStat, Client } from 'minio';
import {
  normalizeMinioStorageError,
  normalizeObjectStorageReadStream,
} from './object-storage.errors';
import {
  assertSignedUrlTtl,
  type ObjectStorageListPage,
  type ObjectStoragePort,
  type ObjectStoragePutInput,
  type ObjectStoragePutResult,
  type ObjectStorageSignedCapability,
  type ObjectStorageSignedGetOverrides,
  type ObjectStorageStat,
} from './object-storage.port';

export const STORAGE_READINESS_REQUEST_TIMEOUT_MS = 500;

const MINIO_STANDARD_METADATA_KEYS = new Set([
  'content-type',
  'cache-control',
  'content-encoding',
  'content-disposition',
  'content-language',
  'if-none-match',
  'if-match',
]);

const STORAGE_READINESS_TIMEOUT_CODE = 'storage_readiness_timeout';

class StorageReadinessTimeoutError extends Error {
  readonly code = STORAGE_READINESS_TIMEOUT_CODE;

  constructor() {
    super(STORAGE_READINESS_TIMEOUT_CODE);
    this.name = 'StorageReadinessTimeoutError';
  }
}

@Injectable()
export class MinioAdapter implements ObjectStoragePort {
  private readonly client: Client;
  private readonly readinessClient: Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint = new URL(
      this.configService.getOrThrow<string>('STORAGE_ENDPOINT'),
    );
    const port = endpoint.port
      ? Number(endpoint.port)
      : endpoint.protocol === 'https:'
        ? 443
        : 80;
    const useSSL = endpoint.protocol === 'https:';
    const accessKey =
      this.configService.getOrThrow<string>('STORAGE_ACCESS_KEY');
    const secretKey =
      this.configService.getOrThrow<string>('STORAGE_SECRET_KEY');

    this.client = new Client({
      endPoint: endpoint.hostname,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    this.readinessClient = new Client({
      endPoint: endpoint.hostname,
      port,
      useSSL,
      accessKey,
      secretKey,
      retryOptions: {
        disableRetry: true,
      },
      transport: createReadinessTransport(useSSL),
      transportAgent: useSSL
        ? new HttpsAgent({
            keepAlive: false,
            maxSockets: 2,
            maxTotalSockets: 2,
          })
        : new HttpAgent({
            keepAlive: false,
            maxSockets: 2,
            maxTotalSockets: 2,
          }),
    });
  }

  async ensureBucketExists(bucket: string): Promise<void> {
    try {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket);
      }
    } catch (error) {
      throw normalizeMinioStorageError(error);
    }
  }

  async isBucketAvailable(bucket: string): Promise<boolean> {
    try {
      return await this.readinessClient.bucketExists(bucket);
    } catch (error) {
      throw normalizeMinioStorageError(error);
    }
  }

  async putObject(
    input: ObjectStoragePutInput,
  ): Promise<ObjectStoragePutResult> {
    const size =
      input.body instanceof Readable
        ? input.sizeBytes
        : Buffer.isBuffer(input.body)
          ? input.body.byteLength
          : Buffer.byteLength(input.body);
    if (size === undefined || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('storage_object_size_required');
    }

    await this.ensureBucketExists(input.bucket);

    const metadata = {
      ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
      ...(input.metadata ?? {}),
    };

    try {
      const uploaded = await this.client.putObject(
        input.bucket,
        input.objectKey,
        input.body,
        size,
        metadata,
      );

      return {
        etag: uploaded.etag,
        generation: null,
        version: uploaded.versionId ?? null,
      };
    } catch (error) {
      throw normalizeMinioStorageError(error);
    }
  }

  async deleteObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void> {
    try {
      await this.client.removeObject(input.bucket, input.objectKey);
    } catch (error) {
      throw normalizeMinioStorageError(error);
    }
  }

  async statObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<ObjectStorageStat> {
    try {
      return normalizeMinioStat(
        await this.client.statObject(input.bucket, input.objectKey),
      );
    } catch (error) {
      throw normalizeMinioStorageError(error);
    }
  }

  async getObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<Readable> {
    try {
      const source = await this.client.getObject(input.bucket, input.objectKey);
      return normalizeObjectStorageReadStream(source, 'minio');
    } catch (error) {
      throw normalizeMinioStorageError(error);
    }
  }

  listObjectsPage(input: {
    bucket: string;
    prefix: string;
    cursor?: string;
    limit: number;
  }): Promise<ObjectStorageListPage> {
    let startAfter: string | undefined;
    try {
      startAfter = input.cursor ? decodeMinioCursor(input.cursor) : undefined;
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error('storage_list_cursor_invalid'),
      );
    }

    return new Promise((resolve, reject) => {
      const objects: ObjectStorageListPage['objects'] = [];
      let settled = false;
      let stream: Readable;
      try {
        stream = this.client.listObjectsV2(
          input.bucket,
          input.prefix,
          true,
          startAfter,
        );
      } catch (error) {
        reject(normalizeMinioStorageError(error));
        return;
      }

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
          nextCursor: encodeMinioCursor(
            objects[objects.length - 1]?.objectKey ?? '',
          ),
        });
      });
      stream.on('error', (error) => {
        if (!settled) reject(normalizeMinioStorageError(error));
      });
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ objects, nextCursor: null });
      });
    });
  }

  async createSignedGetUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
    overrides?: ObjectStorageSignedGetOverrides;
  }): Promise<ObjectStorageSignedCapability> {
    assertSignedUrlTtl(input.expiresInSeconds);
    try {
      const url = await this.client.presignedGetObject(
        input.bucket,
        input.objectKey,
        input.expiresInSeconds,
        toMinioResponseHeaders(input.overrides),
      );
      return {
        url,
        expiresAt: parsePresignedExpiry(url, 'storage_signed_get'),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('storage_signed_')
      ) {
        throw error;
      }
      throw normalizeMinioStorageError(error);
    }
  }

  async createSignedPutUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<ObjectStorageSignedCapability> {
    assertSignedUrlTtl(input.expiresInSeconds);
    await this.ensureBucketExists(input.bucket);
    try {
      const url = await this.client.presignedPutObject(
        input.bucket,
        input.objectKey,
        input.expiresInSeconds,
      );
      return {
        url,
        expiresAt: parsePresignedExpiry(url, 'storage_signed_put'),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('storage_signed_')
      ) {
        throw error;
      }
      throw normalizeMinioStorageError(error);
    }
  }

  async objectExists(input: {
    bucket: string;
    objectKey: string;
  }): Promise<boolean> {
    try {
      await this.client.statObject(input.bucket, input.objectKey);
      return true;
    } catch (error) {
      const normalized = normalizeMinioStorageError(error);
      if (normalized.kind === 'not_found') return false;
      throw normalized;
    }
  }
}

function normalizeMinioStat(stat: BucketItemStat): ObjectStorageStat {
  const rawMetadata = normalizeStringMetadata(stat.metaData);
  const contentType = findContentType(rawMetadata);
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata).filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return (
        !MINIO_STANDARD_METADATA_KEYS.has(normalizedKey) &&
        !normalizedKey.startsWith('x-amz-')
      );
    }),
  );
  return {
    size: stat.size,
    etag: stat.etag || null,
    contentType,
    metadata,
    lastModified: stat.lastModified ?? null,
    generation: null,
    version: stat.versionId ?? null,
  };
}

function normalizeStringMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function findContentType(metadata: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase() === 'content-type') {
      return value.split(';', 1)[0].trim().toLowerCase();
    }
  }
  return null;
}

function toMinioResponseHeaders(
  overrides: ObjectStorageSignedGetOverrides | undefined,
): Record<string, string> | undefined {
  if (!overrides) return undefined;
  const responseHeaders: Record<string, string> = {};
  if (overrides.contentType) {
    responseHeaders['response-content-type'] = overrides.contentType;
  }
  if (overrides.contentDisposition) {
    responseHeaders['response-content-disposition'] =
      overrides.contentDisposition;
  }
  return Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined;
}

function encodeMinioCursor(objectKey: string): string {
  return Buffer.from(
    JSON.stringify({ version: 1, provider: 'minio', after: objectKey }),
    'utf8',
  ).toString('base64url');
}

function decodeMinioCursor(cursor: string): string {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { version?: unknown; provider?: unknown; after?: unknown };
    if (
      decoded.version !== 1 ||
      decoded.provider !== 'minio' ||
      typeof decoded.after !== 'string' ||
      decoded.after.length === 0
    ) {
      throw new Error('invalid');
    }
    return decoded.after;
  } catch {
    throw new Error('storage_list_cursor_invalid');
  }
}

function createReadinessTransport(
  useSSL: boolean,
): Pick<typeof import('node:http'), 'request'> {
  const requestWithProtocol = useSSL ? httpsRequest : httpRequest;

  return {
    request: ((
      options: RequestOptions,
      callback?: (response: IncomingMessage) => void,
    ): ClientRequest => {
      const request = requestWithProtocol(options, callback);
      const deadline = setTimeout(() => {
        request.destroy(new StorageReadinessTimeoutError());
      }, STORAGE_READINESS_REQUEST_TIMEOUT_MS);
      deadline.unref();

      const clearDeadline = (): void => {
        clearTimeout(deadline);
      };
      request.once('close', clearDeadline);
      request.once('error', clearDeadline);

      return request;
    }) as typeof httpRequest,
  };
}

function parsePresignedExpiry(value: string, errorPrefix: string): Date {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${errorPrefix}_url_invalid`);
  }
  const signedAt = url.searchParams.get('X-Amz-Date');
  const expiresText = url.searchParams.get('X-Amz-Expires');
  if (!signedAt || !/^\d{8}T\d{6}Z$/u.test(signedAt) || !expiresText) {
    throw new Error(`${errorPrefix}_expiry_missing`);
  }
  const expiresInSeconds = Number(expiresText);
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error(`${errorPrefix}_expiry_invalid`);
  }
  const signedAtMilliseconds = Date.UTC(
    Number(signedAt.slice(0, 4)),
    Number(signedAt.slice(4, 6)) - 1,
    Number(signedAt.slice(6, 8)),
    Number(signedAt.slice(9, 11)),
    Number(signedAt.slice(11, 13)),
    Number(signedAt.slice(13, 15)),
  );
  const parsedSignedAt = new Date(signedAtMilliseconds);
  const normalizedSignedAt =
    `${parsedSignedAt.getUTCFullYear().toString().padStart(4, '0')}` +
    `${(parsedSignedAt.getUTCMonth() + 1).toString().padStart(2, '0')}` +
    `${parsedSignedAt.getUTCDate().toString().padStart(2, '0')}T` +
    `${parsedSignedAt.getUTCHours().toString().padStart(2, '0')}` +
    `${parsedSignedAt.getUTCMinutes().toString().padStart(2, '0')}` +
    `${parsedSignedAt.getUTCSeconds().toString().padStart(2, '0')}Z`;
  if (
    !Number.isFinite(signedAtMilliseconds) ||
    normalizedSignedAt !== signedAt
  ) {
    throw new Error(`${errorPrefix}_expiry_invalid`);
  }
  return new Date(signedAtMilliseconds + expiresInSeconds * 1000);
}
