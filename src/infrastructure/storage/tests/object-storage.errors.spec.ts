import { PassThrough } from 'node:stream';
import {
  ObjectStorageError,
  isObjectStorageNotFoundError,
  normalizeGcsStorageError,
  normalizeMinioStorageError,
  normalizeObjectStorageReadStream,
} from '../object-storage.errors';

const { FetchError } = require('node-fetch') as {
  FetchError: new (
    message: string,
    type: string,
  ) => Error & {
    code?: string;
    type: string;
  };
};

describe('provider-neutral object storage errors', () => {
  it('maps MinIO and GCS absence to the same stable classification', () => {
    const minio = normalizeMinioStorageError({
      code: 'NoSuchKey',
      message: 'private-bucket/secret-object',
    });
    const gcs = normalizeGcsStorageError({
      code: 404,
      message: 'https://storage.googleapis.com/private-bucket/secret-object',
    });

    expect(minio).toEqual(new ObjectStorageError('not_found'));
    expect(gcs).toEqual(new ObjectStorageError('not_found'));
    expect(isObjectStorageNotFoundError(minio)).toBe(true);
    expect(isObjectStorageNotFoundError(gcs)).toBe(true);
  });

  it.each([
    [normalizeMinioStorageError, { code: 'AccessDenied' }],
    [normalizeGcsStorageError, { code: 403 }],
  ])(
    'classifies provider permission errors consistently',
    (normalize, error) => {
      expect(normalize(error)).toEqual(
        new ObjectStorageError('permission_denied'),
      );
    },
  );

  it.each([
    [401, 'permission_denied'],
    ['403', 'permission_denied'],
    [404, 'not_found'],
    ['408', 'transient'],
    [409, 'precondition_conflict'],
    ['412', 'precondition_conflict'],
    [429, 'rate_quota'],
    ['503', 'transient'],
  ] as const)(
    'classifies a MinIO HTTP-like code %p as %s',
    (code, expectedKind) => {
      expect(normalizeMinioStorageError({ code })).toEqual(
        new ObjectStorageError(expectedKind),
      );
    },
  );

  it('classifies the bounded readiness deadline as transient', () => {
    expect(
      normalizeMinioStorageError({ code: 'storage_readiness_timeout' }),
    ).toEqual(new ObjectStorageError('transient'));
  });

  it.each([
    [normalizeMinioStorageError, { code: 'ServiceUnavailable' }],
    [normalizeGcsStorageError, { code: 503 }],
  ])(
    'classifies provider transient errors consistently',
    (normalize, error) => {
      expect(normalize(error)).toEqual(new ObjectStorageError('transient'));
    },
  );

  it('recognizes GCS quota reasons even when the HTTP status is 403', () => {
    expect(
      normalizeGcsStorageError({
        code: 403,
        errors: [{ reason: 'rateLimitExceeded' }],
      }),
    ).toEqual(new ObjectStorageError('rate_quota'));
  });

  it.each(['request-timeout', 'body-timeout'])(
    'classifies the installed GCS %s FetchError as transient',
    (type) => {
      const error = new FetchError(
        'network timeout at: https://storage.invalid/redacted',
        type,
      );

      expect(error.name).toBe('FetchError');
      expect(error.type).toBe(type);
      expect(error.code).toBeUndefined();
      expect(normalizeGcsStorageError(error)).toEqual(
        new ObjectStorageError('transient'),
      );
    },
  );

  it('keeps unrelated GCS errors unknown', () => {
    expect(
      normalizeGcsStorageError({
        name: 'UnrelatedError',
        type: 'unrelated',
      }),
    ).toEqual(new ObjectStorageError('unknown'));
  });

  it.each([
    [normalizeMinioStorageError, { code: 'PreconditionFailed' }],
    [normalizeGcsStorageError, { code: 412 }],
  ])(
    'classifies provider precondition conflicts consistently',
    (normalize, error) => {
      expect(normalize(error)).toEqual(
        new ObjectStorageError('precondition_conflict'),
      );
    },
  );

  it('never copies raw provider details into the normalized error', () => {
    const normalized = normalizeGcsStorageError({
      code: 500,
      message:
        'https://secret-endpoint.invalid/bucket/object?X-Goog-Signature=secret',
    });

    expect(String(normalized)).toBe(
      'ObjectStorageError: object_storage_transient_failure',
    );
    expect(JSON.stringify(normalized)).not.toContain('secret');
  });

  it.each(['minio', 'gcs'] as const)(
    'normalizes asynchronous %s read-stream errors',
    async (provider) => {
      const source = new PassThrough();
      const stream = normalizeObjectStorageReadStream(source, provider);
      const error = new Promise<unknown>((resolve) =>
        stream.once('error', resolve),
      );

      source.destroy(
        Object.assign(new Error('provider endpoint secret'), { code: 503 }),
      );

      await expect(error).resolves.toEqual(new ObjectStorageError('transient'));
    },
  );
});
