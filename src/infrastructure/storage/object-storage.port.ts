import type { Readable } from 'node:stream';

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');

export const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const MAX_OBJECT_RANGE_READ_BYTES = 1_048_576;

export type ObjectStorageCapabilities = Readonly<{
  resumableUpload: boolean;
  rangeRead: boolean;
}>;

export type ObjectStorageResumableUploadInput = {
  bucket: string;
  objectKey: string;
  contentType?: string;
  metadata?: Record<string, string>;
  origin?: string;
};

export type ObjectStorageResumableUploadSession = {
  sessionUrl: string;
};

export type ObjectStorageRangeInput = {
  bucket: string;
  objectKey: string;
  offset: number;
  length: number;
};

export type ObjectStorageBody = Buffer | string | Readable;

export type ObjectStoragePutInput = {
  bucket: string;
  objectKey: string;
  body: ObjectStorageBody;
  sizeBytes?: number;
  contentType?: string;
  metadata?: Record<string, string>;
};

export type ObjectStoragePutResult = {
  etag: string;
  generation: string | null;
  version: string | null;
};

export type ObjectStorageStat = {
  size: number;
  etag: string | null;
  contentType: string | null;
  metadata: Readonly<Record<string, string>>;
  lastModified: Date | null;
  generation: string | null;
  version: string | null;
};

export type ObjectStorageSignedCapability = {
  url: string;
  expiresAt: Date;
};

export type ObjectStorageSignedGetOverrides = {
  contentType?: string;
  contentDisposition?: string;
};

export type ObjectStorageListItem = {
  objectKey: string;
  size: number;
  lastModified: Date;
};

export type ObjectStorageListPage = {
  objects: ObjectStorageListItem[];
  nextCursor: string | null;
};

export interface ObjectStoragePort {
  getCapabilities(): ObjectStorageCapabilities;
  createResumableUploadSession(
    input: ObjectStorageResumableUploadInput,
  ): Promise<ObjectStorageResumableUploadSession>;
  readObjectRange(input: ObjectStorageRangeInput): Promise<Buffer>;
  putObject(input: ObjectStoragePutInput): Promise<ObjectStoragePutResult>;
  getObject(input: { bucket: string; objectKey: string }): Promise<Readable>;
  statObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<ObjectStorageStat>;
  deleteObject(input: { bucket: string; objectKey: string }): Promise<void>;
  objectExists(input: { bucket: string; objectKey: string }): Promise<boolean>;
  listObjectsPage(input: {
    bucket: string;
    prefix: string;
    cursor?: string;
    limit: number;
  }): Promise<ObjectStorageListPage>;
  createSignedPutUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<ObjectStorageSignedCapability>;
  createSignedGetUrl(input: {
    bucket: string;
    objectKey: string;
    expiresInSeconds: number;
    overrides?: ObjectStorageSignedGetOverrides;
  }): Promise<ObjectStorageSignedCapability>;
  isBucketAvailable(bucket: string): Promise<boolean>;
}

export function assertSignedUrlTtl(expiresInSeconds: number): void {
  if (
    !Number.isSafeInteger(expiresInSeconds) ||
    expiresInSeconds <= 0 ||
    expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS
  ) {
    throw new Error('storage_signed_url_ttl_invalid');
  }
}

export function assertObjectRange(input: ObjectStorageRangeInput): void {
  if (
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0 ||
    !Number.isSafeInteger(input.length) ||
    input.length <= 0 ||
    input.length > MAX_OBJECT_RANGE_READ_BYTES ||
    input.offset > Number.MAX_SAFE_INTEGER - (input.length - 1)
  ) {
    throw new Error('storage_object_range_invalid');
  }
}
