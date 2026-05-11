export const DEFAULT_ALLOWED_CHARACTERS =
  'letters_numbers_dots_underscores_hyphens';

export const DEFAULT_USERNAME_MIN_LENGTH = 3;
export const DEFAULT_USERNAME_MAX_LENGTH = 40;

export const DEFAULT_RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'root',
  'support',
  'system',
  'owner',
  'principal',
  'teacher',
  'student',
  'parent',
  'null',
  'undefined',
  'test',
] as const;

export type UsernameValidationReason =
  | 'username_required'
  | 'username_too_short'
  | 'username_too_long'
  | 'username_contains_at'
  | 'username_contains_spaces'
  | 'username_has_unsafe_characters'
  | 'username_has_consecutive_dots'
  | 'username_has_forbidden_edge_character'
  | 'reserved_username';

export type LoginDomainValidationReason =
  | 'login_domain_required'
  | 'login_domain_has_protocol'
  | 'login_domain_has_path'
  | 'login_domain_has_at'
  | 'login_domain_has_port'
  | 'login_domain_not_ascii'
  | 'login_domain_invalid_format';

export interface UsernamePolicySettings {
  usernameMinLength?: number | null;
  usernameMaxLength?: number | null;
  reservedUsernames?: unknown;
}

export interface UsernameValidationResult {
  username: string;
  valid: boolean;
  reason: UsernameValidationReason | null;
}

export interface LoginDomainValidationResult {
  loginDomain: string;
  valid: boolean;
  reason: LoginDomainValidationReason | null;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeLoginDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export function parseReservedUsernames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeUsername(entry))
    .filter((entry) => entry.length > 0);
}

export function effectiveReservedUsernames(
  settings?: UsernamePolicySettings | null,
): string[] {
  return [
    ...new Set([
      ...DEFAULT_RESERVED_USERNAMES,
      ...parseReservedUsernames(settings?.reservedUsernames),
    ]),
  ];
}

export function validateUsername(
  username: string,
  settings?: UsernamePolicySettings | null,
): UsernameValidationResult {
  const normalized = normalizeUsername(username);
  const minLength = settings?.usernameMinLength ?? DEFAULT_USERNAME_MIN_LENGTH;
  const maxLength = settings?.usernameMaxLength ?? DEFAULT_USERNAME_MAX_LENGTH;

  if (normalized.length === 0) {
    return { username: normalized, valid: false, reason: 'username_required' };
  }
  if (normalized.length < minLength) {
    return { username: normalized, valid: false, reason: 'username_too_short' };
  }
  if (normalized.length > maxLength) {
    return { username: normalized, valid: false, reason: 'username_too_long' };
  }
  if (normalized.includes('@')) {
    return {
      username: normalized,
      valid: false,
      reason: 'username_contains_at',
    };
  }
  if (/\s/.test(normalized)) {
    return {
      username: normalized,
      valid: false,
      reason: 'username_contains_spaces',
    };
  }
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    return {
      username: normalized,
      valid: false,
      reason: 'username_has_unsafe_characters',
    };
  }
  if (normalized.includes('..')) {
    return {
      username: normalized,
      valid: false,
      reason: 'username_has_consecutive_dots',
    };
  }
  if (/^[._-]|[._-]$/.test(normalized)) {
    return {
      username: normalized,
      valid: false,
      reason: 'username_has_forbidden_edge_character',
    };
  }
  if (effectiveReservedUsernames(settings).includes(normalized)) {
    return { username: normalized, valid: false, reason: 'reserved_username' };
  }

  return { username: normalized, valid: true, reason: null };
}

export function validateLoginDomain(
  domain: string,
): LoginDomainValidationResult {
  const normalized = normalizeLoginDomain(domain);

  if (normalized.length === 0) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_required',
    };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(normalized)) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_has_protocol',
    };
  }
  if (/[/?#]/.test(normalized)) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_has_path',
    };
  }
  if (normalized.includes('@')) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_has_at',
    };
  }
  if (normalized.includes(':')) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_has_port',
    };
  }
  if (!/^[\x00-\x7F]+$/.test(normalized)) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_not_ascii',
    };
  }
  if (!isDomainLike(normalized)) {
    return {
      loginDomain: normalized,
      valid: false,
      reason: 'login_domain_invalid_format',
    };
  }

  return { loginDomain: normalized, valid: true, reason: null };
}

export function buildLoginEmail(username: string, loginDomain: string): string {
  return `${normalizeUsername(username)}@${normalizeLoginDomain(loginDomain)}`;
}

function isDomainLike(domain: string): boolean {
  if (domain.length > 253) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;

  const topLevelDomain = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(topLevelDomain)) return false;

  return labels.every((label) => {
    if (label.length < 1 || label.length > 63) return false;
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
  });
}
