import { FirebasePushErrorCode } from './firebase-push.types';

const FIREBASE_ERROR_CODE_MAP = new Map<string, FirebasePushErrorCode>([
  [
    'messaging/registration-token-not-registered',
    'fcm/registration-token-not-registered',
  ],
  ['messaging/invalid-registration-token', 'fcm/invalid-registration-token'],
  ['messaging/invalid-argument', 'fcm/invalid-argument'],
  ['messaging/quota-exceeded', 'fcm/quota-exceeded'],
  ['messaging/sender-id-mismatch', 'fcm/sender-id-mismatch'],
  ['messaging/unavailable', 'fcm/unavailable'],
  ['messaging/internal', 'fcm/internal'],
]);

const GENERIC_FIREBASE_PUSH_ERROR_MESSAGE = 'Firebase push send failed';
const MAX_SAFE_ERROR_MESSAGE_LENGTH = 240;

export interface NormalizedFirebasePushError {
  errorCode: FirebasePushErrorCode;
  errorMessage: string;
}

export function normalizeFirebasePushError(
  error: unknown,
): NormalizedFirebasePushError {
  const code = readProviderErrorCode(error);
  const errorCode = code
    ? (FIREBASE_ERROR_CODE_MAP.get(code) ?? 'fcm/unknown')
    : 'fcm/unknown';

  return {
    errorCode,
    errorMessage: sanitizeFirebasePushErrorMessage(
      readProviderErrorMessage(error),
    ),
  };
}

export function sanitizeFirebasePushErrorMessage(
  value: string | null | undefined,
): string {
  if (!value) return GENERIC_FIREBASE_PUSH_ERROR_MESSAGE;

  const redacted = value
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,
      '[redacted]',
    )
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, 'bearer [redacted]')
    .replace(/authorization\s*[:=]\s*[^\s,;]+/gi, 'authorization=[redacted]')
    .replace(/api[_-]?key\s*[:=]\s*[^\s,;]+/gi, 'apiKey=[redacted]')
    .replace(/private[_\s-]?key\s*[:=]\s*[^\s,;]+/gi, 'privateKey=[redacted]')
    .replace(/credential[s]?\s*[:=]\s*[^\s,;]+/gi, 'credential=[redacted]')
    .replace(/token\s*[:=]\s*[^\s,;]+/gi, 'token=[redacted]');

  if (
    /(authorization|bearer|credential|private\s*key|api[_-]?key|token|secret)/i.test(
      redacted,
    )
  ) {
    return GENERIC_FIREBASE_PUSH_ERROR_MESSAGE;
  }

  const normalized = redacted.replace(/\s+/g, ' ').trim();
  if (!normalized) return GENERIC_FIREBASE_PUSH_ERROR_MESSAGE;

  if (normalized.length <= MAX_SAFE_ERROR_MESSAGE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_SAFE_ERROR_MESSAGE_LENGTH - 3)}...`;
}

function readProviderErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  const directCode = readString(record.code);
  if (directCode) return directCode;

  const errorInfo = record.errorInfo;
  if (!errorInfo || typeof errorInfo !== 'object') return null;
  return readString((errorInfo as Record<string, unknown>).code);
}

function readProviderErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  const directMessage = readString(record.message);
  if (directMessage) return directMessage;

  const errorInfo = record.errorInfo;
  if (!errorInfo || typeof errorInfo !== 'object') return null;
  return readString((errorInfo as Record<string, unknown>).message);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}