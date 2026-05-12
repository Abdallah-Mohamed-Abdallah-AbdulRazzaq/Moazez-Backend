import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailConnectionConfig {
  fromName?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
}

export function normalizeOptionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeRequiredText(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized === undefined ? null : normalized;
}

export function normalizeEmail(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toLowerCase() : normalized;
}

export function validateSmtpConnectionConfig(
  config: EmailConnectionConfig,
): void {
  const missing: string[] = [];

  if (!config.fromName) missing.push('fromName');
  if (!isEmail(config.fromEmail)) missing.push('fromEmail');
  if (config.replyToEmail && !isEmail(config.replyToEmail)) {
    missing.push('replyToEmail');
  }
  if (!config.host) missing.push('host');
  if (!config.port || config.port < 1 || config.port > 65535) {
    missing.push('port');
  }
  if (!config.username) missing.push('username');

  if (missing.length > 0) {
    throw new ValidationDomainException('SMTP email connection is invalid', {
      fields: missing,
    });
  }
}

function isEmail(value: string | null | undefined): value is string {
  return Boolean(value && EMAIL_PATTERN.test(value));
}
