import type {
  TeacherEmploymentType,
  TeacherGender,
  TeacherWorkDay,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { normalizeContactEmail } from '../../../settings/login-identity/domain/login-identity.policy';
import type { TeacherLifecycleProfileManagedFields } from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import {
  isExperienceYearsValid,
  isValidNormalizedTeacherCode,
  normalizeTeacherCode,
  normalizeWorkingDays,
  validateWorkTimePair,
} from '../../profile/domain/teacher-profile.integrity';
import {
  CANONICAL_TEACHER_WORK_DAYS,
  TEACHER_EMPLOYMENT_TYPES,
  TEACHER_GENDERS,
} from '../../profile/domain/teacher-profile.types';
import type { PreferredDisplayLanguage } from './teacher-directory.types';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u;

export const TEACHER_MANAGED_NAME_FIELDS = [
  'firstNameAr',
  'lastNameAr',
  'firstNameEn',
  'lastNameEn',
] as const;

export interface TeacherManagedProfileCommand {
  teacherCode?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  gender?: TeacherGender | null;
  department?: string | null;
  specialization?: string | null;
  employmentType?: TeacherEmploymentType | null;
  experienceYears?: number | null;
  hireDate?: string | null;
  workingDays?: TeacherWorkDay[];
  workStartTime?: string | null;
  workEndTime?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;
}

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
  if (
    days.length > CANONICAL_TEACHER_WORK_DAYS.length ||
    days.some((day) => !CANONICAL_TEACHER_WORK_DAYS.includes(day))
  ) {
    throw invalidField('workingDays');
  }
  if (new Set(days).size !== days.length) {
    throw new ValidationDomainException('Working days must be unique', {
      field: 'workingDays',
    });
  }
  return normalizeWorkingDays(days);
}

export function buildTeacherProfileManagedFields(
  command: TeacherManagedProfileCommand,
): TeacherLifecycleProfileManagedFields {
  const fields: TeacherLifecycleProfileManagedFields = {};
  if (command.teacherCode !== undefined) {
    const code = normalizeTeacherCode(command.teacherCode);
    if (!code || !isValidNormalizedTeacherCode(code)) {
      throw invalidField('teacherCode');
    }
    fields.teacherCode = code;
  }
  for (const name of TEACHER_MANAGED_NAME_FIELDS) {
    if (command[name] !== undefined) {
      fields[name] = normalizeBoundedText(command[name], name, 50);
    }
  }
  for (const name of ['department', 'specialization'] as const) {
    if (command[name] !== undefined) {
      fields[name] = normalizeBoundedText(command[name], name, 120);
    }
  }
  for (const name of ['notesAr', 'notesEn'] as const) {
    if (command[name] !== undefined) {
      fields[name] = normalizeBoundedText(command[name], name, 500);
    }
  }
  if (command.gender !== undefined) {
    if (command.gender !== null && !TEACHER_GENDERS.includes(command.gender)) {
      throw invalidField('gender');
    }
    fields.gender = command.gender;
  }
  if (command.employmentType !== undefined) {
    if (
      command.employmentType !== null &&
      !TEACHER_EMPLOYMENT_TYPES.includes(command.employmentType)
    ) {
      throw invalidField('employmentType');
    }
    fields.employmentType = command.employmentType;
  }
  if (command.experienceYears !== undefined) {
    if (!isExperienceYearsValid(command.experienceYears)) {
      throw invalidField('experienceYears');
    }
    fields.experienceYears = command.experienceYears;
  }
  if (command.hireDate !== undefined) {
    fields.hireDate = parseTeacherDateOnly(command.hireDate, 'hireDate');
  }
  if (command.workingDays !== undefined) {
    fields.workingDays = normalizeTeacherWorkingDays(command.workingDays);
  }
  if (
    command.workStartTime !== undefined ||
    command.workEndTime !== undefined
  ) {
    if (
      command.workStartTime === undefined ||
      command.workEndTime === undefined
    ) {
      throw new ValidationDomainException(
        'Work times must be supplied as a pair',
        { field: 'workStartTime' },
      );
    }
    const start = parseTeacherTime(command.workStartTime, 'workStartTime');
    const end = parseTeacherTime(command.workEndTime, 'workEndTime');
    const validation = validateWorkTimePair(start ?? null, end ?? null);
    if (!validation.isValid) {
      throw new ValidationDomainException('Invalid work-time pair', {
        field: validation.isPairValid ? 'workEndTime' : 'workStartTime',
      });
    }
    fields.workStartTime = start;
    fields.workEndTime = end;
  }
  return fields;
}

export function selectTeacherDisplayNames(
  names: {
    firstNameAr: string | null;
    lastNameAr: string | null;
    firstNameEn: string | null;
    lastNameEn: string | null;
  },
  language: PreferredDisplayLanguage,
): { firstName: string; lastName: string } {
  const firstName = language === 'AR' ? names.firstNameAr : names.firstNameEn;
  const lastName = language === 'AR' ? names.lastNameAr : names.lastNameEn;
  if (!firstName || !lastName) {
    throw new ValidationDomainException(
      'Preferred display language requires both managed names',
      { field: 'preferredDisplayLanguage' },
    );
  }
  return { firstName, lastName };
}

function normalizeBoundedText(
  value: string | null,
  field: string,
  maximumLength: number,
): string | null {
  const normalized = normalizeNullableText(value) ?? null;
  if (normalized !== null && normalized.length > maximumLength) {
    throw invalidField(field);
  }
  return normalized;
}

function invalidField(field: string): ValidationDomainException {
  return new ValidationDomainException('Invalid Teacher Directory field', {
    field,
  });
}
