import { randomInt } from 'node:crypto';

export type CredentialPasswordFailureReason =
  | 'password_required'
  | 'password_too_short'
  | 'password_missing_uppercase'
  | 'password_missing_lowercase'
  | 'password_missing_number'
  | 'password_missing_symbol'
  | 'password_common';

export interface CredentialPasswordValidationResult {
  valid: boolean;
  reasons: CredentialPasswordFailureReason[];
}

const MIN_PASSWORD_LENGTH = 12;
const TEMPORARY_PASSWORD_PREFIX = 'MZ';
const TEMPORARY_PASSWORD_GROUPS = 4;
const TEMPORARY_PASSWORD_GROUP_LENGTH = 4;
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password123!',
  'admin123',
  'admin123!',
  'school123',
  'school123!',
  'moazez123',
  'qwerty123',
  'qwerty123!',
  '123456789012',
  'welcome123',
  'welcome123!',
]);

export function validateAdminProvidedPassword(
  password: string,
): CredentialPasswordValidationResult {
  const reasons: CredentialPasswordFailureReason[] = [];
  const normalized = password.trim();

  if (normalized.length === 0) {
    reasons.push('password_required');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    reasons.push('password_too_short');
  }

  if (!/[A-Z]/.test(password)) {
    reasons.push('password_missing_uppercase');
  }

  if (!/[a-z]/.test(password)) {
    reasons.push('password_missing_lowercase');
  }

  if (!/[0-9]/.test(password)) {
    reasons.push('password_missing_number');
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    reasons.push('password_missing_symbol');
  }

  if (COMMON_PASSWORDS.has(normalized.toLowerCase())) {
    reasons.push('password_common');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function generateTemporaryPassword(options?: {
  prefix?: string;
  groups?: number;
  groupLength?: number;
}): string {
  const prefix = options?.prefix ?? TEMPORARY_PASSWORD_PREFIX;
  const groups = options?.groups ?? TEMPORARY_PASSWORD_GROUPS;
  const groupLength = options?.groupLength ?? TEMPORARY_PASSWORD_GROUP_LENGTH;

  const chunks = Array.from({ length: groups }, () =>
    randomCharacters(groupLength),
  );

  return [prefix, ...chunks].join('-');
}

function randomCharacters(length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value +=
      TEMPORARY_PASSWORD_ALPHABET[
        randomInt(0, TEMPORARY_PASSWORD_ALPHABET.length)
      ];
  }
  return value;
}
