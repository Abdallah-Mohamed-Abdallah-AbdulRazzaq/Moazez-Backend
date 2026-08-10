import {
  Storage,
  type FileMetadata,
  type StorageOptions,
} from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  ObjectStorageError,
  normalizeGcsStorageError,
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

export const GCS_READINESS_REQUEST_TIMEOUT_MS = 500;

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';

export interface GcsClientFactory {
  createRuntimeClient(projectId: string): Storage;
  createReadinessClient(projectId: string): Storage;
  createSigningClient(input: {
    projectId: string;
    signerServiceAccount: string;
  }): Promise<Storage>;
}

export class DefaultGcsClientFactory implements GcsClientFactory {
  createRuntimeClient(projectId: string): Storage {
    return new Storage({ projectId });
  }

  createReadinessClient(projectId: string): Storage {
    return new Storage({
      projectId,
      timeout: GCS_READINESS_REQUEST_TIMEOUT_MS,
      retryOptions: {
        autoRetry: false,
        maxRetries: 0,
        totalTimeout: GCS_READINESS_REQUEST_TIMEOUT_MS / 1_000,
      },
    });
  }

  async createSigningClient(input: {
    projectId: string;
    signerServiceAccount: string;
  }): Promise<Storage> {
    const sourceAuth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
    const sourceClient = await sourceAuth.getClient();
    const signer = new Impersonated({
      sourceClient,
      targetPrincipal: input.signerServiceAccount,
      targetScopes: [STORAGE_SCOPE],
      lifetime: 3_600,
    });

    return new Storage({
      projectId: input.projectId,
      authClient: signer as unknown as StorageOptions['authClient'],
    });
  }
}

@Injectable()
export class GcsAdapter implements ObjectStoragePort {
  private readonly projectId: string;
  private readonly runtimeClient: Storage;
  private readonly readinessClient: Storage;
  private signingClientPromise: Promise<Storage> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly clientFactory: GcsClientFactory = new DefaultGcsClientFactory(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.projectId = this.configService.getOrThrow<string>('GCP_PROJECT_ID');
    this.runtimeClient = this.clientFactory.createRuntimeClient(this.projectId);
    this.readinessClient = this.clientFactory.createReadinessClient(
      this.projectId,
    );
  }

  async putObject(
    input: ObjectStoragePutInput,
  ): Promise<ObjectStoragePutResult> {
    const file = this.runtimeClient.bucket(input.bucket).file(input.objectKey);
    const source = toReadable(input.body);
    const destination = file.createWriteStream({
      resumable: input.body instanceof Readable,
      ...(input.contentType ? { contentType: input.contentType } : {}),
      metadata: {
        ...(input.contentType ? { contentType: input.contentType } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });

    try {
      await pipeline(source, destination);
      const [metadata] = await file.getMetadata();
      return {
        etag: readRequiredString(metadata.etag),
        generation: readOptionalString(metadata.generation),
        version: null,
      };
    } catch (error) {
      throw normalizeGcsStorageError(error);
    }
  }

  getObject(input: { bucket: string; objectKey: string }): Promise<Readable> {
    try {
      const source = this.runtimeClient
        .bucket(input.bucket)
        .file(input.objectKey)
        .createReadStream();
      return Promise.resolve(normalizeObjectStorageReadStream(source, 'gcs'));
    } catch (error) {
      return Promise.reject(normalizeGcsStorageError(error));
    }
  }

  async statObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<ObjectStorageStat> {
    try {
      const [metadata] = await this.runtimeClient
        .bucket(input.bucket)
        .file(input.objectKey)
        .getMetadata();
      return normalizeGcsStat(metadata);
    } catch (error) {
      throw normalizeGcsStorageError(error);
    }
  }

  async deleteObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void> {
    try {
      await this.runtimeClient
        .bucket(input.bucket)
        .file(input.objectKey)
        .delete({ ignoreNotFound: true });
    } catch (error) {
      throw normalizeGcsStorageError(error);
    }
  }

  async objectExists(input: {
    bucket: string;
    objectKey: string;
  }): Promise<boolean> {
    try {
      const [exists] = await this.runtimeClient
        .bucket(input.bucket)
        .file(input.objectKey)
        .exists();
      return exists;
    } catch (error) {
      const normalized = normalizeGcsStorageError(error);
      if (normalized.kind === 'not_found') return false;
      throw normalized;
    }
  }

  async listObjectsPage(input: {
    bucket: string;
    prefix: string;
    cursor?: string;
    limit: number;
  }): Promise<ObjectStorageListPage> {
    try {
      const pageToken = input.cursor
        ? decodeGcsCursor(input.cursor)
        : undefined;
      const [files, nextQuery] = await this.runtimeClient
        .bucket(input.bucket)
        .getFiles({
          prefix: input.prefix,
          maxResults: input.limit,
          autoPaginate: false,
          ...(pageToken ? { pageToken } : {}),
        });

      return {
        objects: files.map((file) =>
          normalizeGcsListItem(file.name, file.metadata),
        ),
        nextCursor: nextQuery?.pageToken
          ? encodeGcsCursor(nextQuery.pageToken)
          : null,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'storage_list_cursor_invalid'
      ) {
        throw error;
      }
      throw normalizeGcsStorageError(error);
    }
  }

  async createSignedPutUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<ObjectStorageSignedCapability> {
    assertSignedUrlTtl(input.expiresInSeconds);
    const expiresAt = this.expiryFromNow(input.expiresInSeconds);
    try {
      const signingClient = await this.getSigningClient();
      const [url] = await signingClient
        .bucket(input.bucket)
        .file(input.objectKey)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: expiresAt,
        });
      return { url, expiresAt };
    } catch (error) {
      throw normalizeGcsStorageError(error);
    }
  }

  async createSignedGetUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
    overrides?: ObjectStorageSignedGetOverrides;
  }): Promise<ObjectStorageSignedCapability> {
    assertSignedUrlTtl(input.expiresInSeconds);
    const expiresAt = this.expiryFromNow(input.expiresInSeconds);
    try {
      const signingClient = await this.getSigningClient();
      const [url] = await signingClient
        .bucket(input.bucket)
        .file(input.objectKey)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: expiresAt,
          ...(input.overrides?.contentType
            ? { responseType: input.overrides.contentType }
            : {}),
          ...(input.overrides?.contentDisposition
            ? { responseDisposition: input.overrides.contentDisposition }
            : {}),
        });
      return { url, expiresAt };
    } catch (error) {
      throw normalizeGcsStorageError(error);
    }
  }

  async isBucketAvailable(bucket: string): Promise<boolean> {
    try {
      const [exists] = await this.readinessClient.bucket(bucket).exists();
      return exists;
    } catch (error) {
      throw normalizeGcsStorageError(error);
    }
  }

  private getSigningClient(): Promise<Storage> {
    if (!this.signingClientPromise) {
      const signerServiceAccount = this.configService.getOrThrow<string>(
        'GCS_SIGNING_SERVICE_ACCOUNT',
      );
      this.signingClientPromise = this.clientFactory
        .createSigningClient({
          projectId: this.projectId,
          signerServiceAccount,
        })
        .catch((error: unknown) => {
          this.signingClientPromise = null;
          throw error;
        });
    }
    return this.signingClientPromise;
  }

  private expiryFromNow(expiresInSeconds: number): Date {
    return new Date(this.now().getTime() + expiresInSeconds * 1_000);
  }
}

function toReadable(body: ObjectStoragePutInput['body']): Readable {
  return body instanceof Readable ? body : Readable.from([body]);
}

function normalizeGcsStat(metadata: FileMetadata): ObjectStorageStat {
  return {
    size: readSafeSize(metadata.size),
    etag: readOptionalString(metadata.etag),
    contentType: normalizeContentType(metadata.contentType),
    metadata: normalizeCustomMetadata(metadata.metadata),
    lastModified: readOptionalDate(metadata.updated),
    generation: readOptionalString(metadata.generation),
    version: null,
  };
}

function normalizeGcsListItem(
  objectKey: string,
  metadata: FileMetadata,
): ObjectStorageListPage['objects'][number] {
  const lastModified = readOptionalDate(metadata.updated);
  if (!lastModified) throw new ObjectStorageError('unknown');
  return {
    objectKey,
    size: readSafeSize(metadata.size),
    lastModified,
  };
}

function normalizeCustomMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function normalizeContentType(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value.split(';', 1)[0].trim().toLowerCase();
}

function readSafeSize(value: unknown): number {
  const size = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new ObjectStorageError('unknown');
  }
  return size;
}

function readRequiredString(value: unknown): string {
  const result = readOptionalString(value);
  if (!result) throw new ObjectStorageError('unknown');
  return result;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readOptionalDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const result =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function encodeGcsCursor(pageToken: string): string {
  return Buffer.from(
    JSON.stringify({ version: 1, provider: 'gcs', pageToken }),
    'utf8',
  ).toString('base64url');
}

function decodeGcsCursor(cursor: string): string {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { version?: unknown; provider?: unknown; pageToken?: unknown };
    if (
      decoded.version !== 1 ||
      decoded.provider !== 'gcs' ||
      typeof decoded.pageToken !== 'string' ||
      decoded.pageToken.length === 0
    ) {
      throw new Error('invalid');
    }
    return decoded.pageToken;
  } catch {
    throw new Error('storage_list_cursor_invalid');
  }
}
