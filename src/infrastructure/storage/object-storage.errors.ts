import { PassThrough, type Readable } from 'node:stream';

export type ObjectStorageErrorKind =
  | 'not_found'
  | 'permission_denied'
  | 'precondition_conflict'
  | 'transient'
  | 'rate_quota'
  | 'unknown';

type ObjectStorageProvider = 'minio' | 'gcs';

const ERROR_MESSAGES: Record<ObjectStorageErrorKind, string> = {
  not_found: 'object_storage_not_found',
  permission_denied: 'object_storage_permission_denied',
  precondition_conflict: 'object_storage_precondition_conflict',
  transient: 'object_storage_transient_failure',
  rate_quota: 'object_storage_rate_quota_failure',
  unknown: 'object_storage_provider_failure',
};

export class ObjectStorageError extends Error {
  constructor(readonly kind: ObjectStorageErrorKind) {
    super(ERROR_MESSAGES[kind]);
    this.name = 'ObjectStorageError';
  }
}

export function isObjectStorageNotFoundError(error: unknown): boolean {
  return error instanceof ObjectStorageError && error.kind === 'not_found';
}

export function normalizeMinioStorageError(error: unknown): ObjectStorageError {
  return normalizeObjectStorageError(error, 'minio');
}

export function normalizeGcsStorageError(error: unknown): ObjectStorageError {
  return normalizeObjectStorageError(error, 'gcs');
}

export function normalizeObjectStorageReadStream(
  source: Readable,
  provider: ObjectStorageProvider,
): Readable {
  const output = new PassThrough();

  source.once('error', (error) => {
    output.destroy(normalizeObjectStorageError(error, provider));
  });
  output.once('close', () => {
    if (!source.destroyed) source.destroy();
  });
  source.pipe(output);

  return output;
}

function normalizeObjectStorageError(
  error: unknown,
  provider: ObjectStorageProvider,
): ObjectStorageError {
  if (error instanceof ObjectStorageError) return error;

  const code =
    provider === 'gcs'
      ? readGcsReason(error) || readErrorCode(error)
      : readErrorCode(error);
  const status = readHttpStatus(error) ?? parseHttpStatus(code);
  const kind =
    provider === 'minio'
      ? classifyMinioError(code, status)
      : classifyGcsError(code, status, readErrorType(error));

  return new ObjectStorageError(kind);
}

function classifyMinioError(
  code: string,
  status: number | null,
): ObjectStorageErrorKind {
  if (
    ['NoSuchKey', 'NoSuchObject', 'NotFound'].includes(code) ||
    status === 404
  ) {
    return 'not_found';
  }
  if (
    ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(
      code,
    ) ||
    status === 401 ||
    status === 403
  ) {
    return 'permission_denied';
  }
  if (
    ['PreconditionFailed', 'ConditionalRequestConflict'].includes(code) ||
    status === 409 ||
    status === 412
  ) {
    return 'precondition_conflict';
  }
  if (
    ['SlowDown', 'TooManyRequests', 'QuotaExceeded'].includes(code) ||
    status === 429
  ) {
    return 'rate_quota';
  }
  if (
    [
      'RequestTimeout',
      'InternalError',
      'ServiceUnavailable',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'storage_readiness_timeout',
    ].includes(code) ||
    status === 408 ||
    (status !== null && status >= 500)
  ) {
    return 'transient';
  }
  return 'unknown';
}

function classifyGcsError(
  code: string,
  status: number | null,
  type: string,
): ObjectStorageErrorKind {
  const numericCode = Number(code);
  const resolvedStatus =
    status ?? (Number.isInteger(numericCode) ? numericCode : null);
  if (resolvedStatus === 404 || code === 'notFound') return 'not_found';
  if (
    resolvedStatus === 429 ||
    ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(
      code,
    )
  ) {
    return 'rate_quota';
  }
  if (
    resolvedStatus === 401 ||
    resolvedStatus === 403 ||
    ['forbidden', 'unauthorized', 'permissionDenied'].includes(code)
  ) {
    return 'permission_denied';
  }
  if (
    resolvedStatus === 409 ||
    resolvedStatus === 412 ||
    ['conflict', 'conditionNotMet'].includes(code)
  ) {
    return 'precondition_conflict';
  }
  if (
    ['request-timeout', 'body-timeout'].includes(type) ||
    resolvedStatus === 408 ||
    (resolvedStatus !== null && resolvedStatus >= 500) ||
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)
  ) {
    return 'transient';
  }
  return 'unknown';
}

function readErrorType(error: unknown): string {
  const type = readRecordField(error, 'type');
  return typeof type === 'string' ? type : '';
}

function readErrorCode(error: unknown): string {
  const code = readRecordField(error, 'code');
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : '';
}

function readGcsReason(error: unknown): string {
  const errors = readRecordField(error, 'errors');
  if (!isUnknownArray(errors)) return '';
  const reason = readRecordField(errors[0], 'reason');
  return typeof reason === 'string' ? reason : '';
}

function readHttpStatus(error: unknown): number | null {
  const response = readRecordField(error, 'response');
  for (const candidate of [
    readRecordField(error, 'status'),
    readRecordField(error, 'statusCode'),
    readRecordField(response, 'status'),
  ]) {
    const status = parseHttpStatus(candidate);
    if (status !== null) return status;
  }
  return null;
}

function parseHttpStatus(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^\d{3}$/u.test(value))
  ) {
    return null;
  }
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

function readRecordField(value: unknown, field: string): unknown {
  return isUnknownRecord(value) ? value[field] : undefined;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
