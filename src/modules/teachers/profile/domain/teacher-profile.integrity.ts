import type { TeacherWorkDay } from '@prisma/client';
import {
  CANONICAL_TEACHER_WORK_DAYS,
  type TeacherProfileCompleteness,
  type TeacherProfileCompletenessField,
  type TeacherProfileCompletenessInput,
} from './teacher-profile.types';

const MAX_TEACHER_CODE_LENGTH = 20;
const MIN_EXPERIENCE_YEARS = 0;
const MAX_EXPERIENCE_YEARS = 60;

export function normalizeTeacherCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().replace(/\s/gu, '').toUpperCase() ?? '';
  return normalized.length === 0 ? null : normalized;
}

export function isValidNormalizedTeacherCode(value: string | null): boolean {
  return (
    value === null ||
    (value.length > 0 &&
      value.length <= MAX_TEACHER_CODE_LENGTH &&
      value === value.toUpperCase() &&
      !/\s/u.test(value))
  );
}

export function normalizeWorkingDays(
  days: readonly TeacherWorkDay[],
): TeacherWorkDay[] {
  const selected = new Set(days);
  return CANONICAL_TEACHER_WORK_DAYS.filter((day) => selected.has(day));
}

export function isExperienceYearsValid(value: number | null): boolean {
  return (
    value === null ||
    (Number.isInteger(value) &&
      value >= MIN_EXPERIENCE_YEARS &&
      value <= MAX_EXPERIENCE_YEARS)
  );
}

type WorkTimeValue = Date | string | null;

export interface WorkTimeValidation {
  isPairValid: boolean;
  isOrderValid: boolean;
  isValid: boolean;
}

function workTimeToSeconds(value: Exclude<WorkTimeValue, null>): number | null {
  if (value instanceof Date) {
    return (
      value.getUTCHours() * 3600 +
      value.getUTCMinutes() * 60 +
      value.getUTCSeconds()
    );
  }

  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function validateWorkTimePair(
  workStartTime: WorkTimeValue,
  workEndTime: WorkTimeValue,
): WorkTimeValidation {
  const isPairValid = (workStartTime === null) === (workEndTime === null);
  if (!isPairValid) {
    return { isPairValid: false, isOrderValid: false, isValid: false };
  }

  if (workStartTime === null || workEndTime === null) {
    return { isPairValid: true, isOrderValid: true, isValid: true };
  }

  const start = workTimeToSeconds(workStartTime);
  const end = workTimeToSeconds(workEndTime);
  const isOrderValid = start !== null && end !== null && end > start;
  return { isPairValid: true, isOrderValid, isValid: isOrderValid };
}

function hasManagedValue(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

export function projectTeacherProfileCompleteness(
  profile: TeacherProfileCompletenessInput,
): TeacherProfileCompleteness {
  const missingFields: TeacherProfileCompletenessField[] = [];

  if (!hasManagedValue(profile.teacherCode)) missingFields.push('teacherCode');
  if (!hasManagedValue(profile.firstNameAr)) missingFields.push('firstNameAr');
  if (!hasManagedValue(profile.lastNameAr)) missingFields.push('lastNameAr');
  if (!hasManagedValue(profile.firstNameEn)) missingFields.push('firstNameEn');
  if (!hasManagedValue(profile.lastNameEn)) missingFields.push('lastNameEn');
  if (profile.gender === null) missingFields.push('gender');

  return { isComplete: missingFields.length === 0, missingFields };
}
