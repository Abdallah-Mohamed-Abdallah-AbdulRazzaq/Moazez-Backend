import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

const PICKUP_CODE_LENGTH = 6;
const PICKUP_CODE_HASH_LENGTH = 32;

export interface PickupCodeIssue {
  code: string;
  hash: string;
  salt: string;
  issuedAt: Date;
}

export function issuePickupCode(now = new Date()): PickupCodeIssue {
  const code = randomInt(0, 1_000_000)
    .toString()
    .padStart(PICKUP_CODE_LENGTH, '0');
  const salt = randomBytes(16).toString('hex');

  return {
    code,
    salt,
    hash: hashPickupCode(code, salt),
    issuedAt: now,
  };
}

export function normalizePickupCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

export function verifyPickupCode(params: {
  code: string;
  hash: string;
  salt: string;
}): boolean {
  const expected = Buffer.from(params.hash, 'hex');
  const actual = Buffer.from(hashPickupCode(params.code, params.salt), 'hex');

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function hashPickupCode(code: string, salt: string): string {
  return scryptSync(code, salt, PICKUP_CODE_HASH_LENGTH).toString('hex');
}
