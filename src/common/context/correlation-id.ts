import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';
export const MAX_REQUEST_ID_LENGTH = 128;

const TRUSTED_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;

export function resolveCorrelationId(value: unknown): string {
  const candidate = firstHeaderValue(value);
  if (
    typeof candidate === 'string' &&
    TRUSTED_REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
}

export function isTrustedCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && TRUSTED_REQUEST_ID_PATTERN.test(value);
}

function firstHeaderValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value[0];
}
