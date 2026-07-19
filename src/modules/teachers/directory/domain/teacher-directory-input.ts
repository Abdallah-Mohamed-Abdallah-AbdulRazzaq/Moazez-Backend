import type { TeacherWorkDay } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { normalizeContactEmail } from '../../../settings/login-identity/domain/login-identity.policy';
import { normalizeWorkingDays } from '../../profile/domain/teacher-profile.integrity';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u;

export function normalizeNullableText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function normalizeLoginEmail(value: string): string {
  return normalizeContactEmail(value);
}

export function parseTeacherDateOnly(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw invalidField(field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw invalidField(field);
  }
  return date;
}

export function parseTeacherTime(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const match = TIME_PATTERN.exec(value);
  if (!match) throw invalidField(field);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw invalidField(field);
  return new Date(Date.UTC(1970, 0, 1, hour, minute, second));
}

export function normalizeTeacherWorkingDays(
  days: TeacherWorkDay[],
): TeacherWorkDay[] {
  if (new Set(days).size !== days.length) {
    throw new ValidationDomainException('Working days must be unique', {
      field: 'workingDays',
    });
  }
  return normalizeWorkingDays(days);
}

function invalidField(field: string): ValidationDomainException {
  return new ValidationDomainException('Invalid Teacher Directory field', {
    field,
  });
}
