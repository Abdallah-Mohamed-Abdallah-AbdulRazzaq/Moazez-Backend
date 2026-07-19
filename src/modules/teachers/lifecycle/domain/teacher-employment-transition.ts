import { TeacherEmploymentStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const ISO_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

export function isAllowedTeacherEmploymentTransition(
  previous: TeacherEmploymentStatus,
  next: TeacherEmploymentStatus,
): boolean {
  return (
    (previous === TeacherEmploymentStatus.ACTIVE &&
      (next === TeacherEmploymentStatus.INACTIVE ||
        next === TeacherEmploymentStatus.TERMINATED)) ||
    (previous === TeacherEmploymentStatus.INACTIVE &&
      (next === TeacherEmploymentStatus.ACTIVE ||
        next === TeacherEmploymentStatus.TERMINATED))
  );
}

export function resolveTeacherEmploymentEffectiveAt(
  raw: string | undefined,
  now: Date,
): Date {
  if (!Number.isFinite(now.getTime())) throw invalidEffectiveAt();
  if (raw === undefined) return new Date(now.getTime());

  const match = ISO_INSTANT_PATTERN.exec(raw);
  if (!match) throw invalidEffectiveAt();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw invalidEffectiveAt();
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    throw invalidEffectiveAt();
  }

  const offsetDirection = match[9] === '-' ? -1 : 1;
  const offsetMilliseconds =
    match[8] === 'Z'
      ? 0
      : offsetDirection * (offsetHour * 60 + offsetMinute) * 60 * 1_000;
  const instant = new Date(local.getTime() - offsetMilliseconds);
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.getTime() > now.getTime()
  ) {
    throw invalidEffectiveAt();
  }
  return instant;
}

function invalidEffectiveAt(): ValidationDomainException {
  return new ValidationDomainException(
    'effectiveAt must be an exact non-future ISO timestamp',
    { field: 'effectiveAt' },
  );
}
