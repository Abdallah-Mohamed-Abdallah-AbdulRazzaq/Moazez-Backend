import type {
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  TeacherGender,
  TeacherWorkDay,
} from '@prisma/client';

export const TEACHER_GENDERS = [
  'MALE',
  'FEMALE',
] as const satisfies readonly TeacherGender[];

export const TEACHER_EMPLOYMENT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'TERMINATED',
] as const satisfies readonly TeacherEmploymentStatus[];

export const TEACHER_EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
] as const satisfies readonly TeacherEmploymentType[];

export const CANONICAL_TEACHER_WORK_DAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const satisfies readonly TeacherWorkDay[];

export type TeacherProfileCompletenessField =
  | 'teacherCode'
  | 'firstNameAr'
  | 'lastNameAr'
  | 'firstNameEn'
  | 'lastNameEn'
  | 'gender';

export interface TeacherProfileCompletenessInput {
  teacherCode: string | null;
  firstNameAr: string | null;
  lastNameAr: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  gender: TeacherGender | null;
}

export interface TeacherProfileCompleteness {
  isComplete: boolean;
  missingFields: TeacherProfileCompletenessField[];
}
