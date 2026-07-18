import {
  CANONICAL_TEACHER_WORK_DAYS,
  TEACHER_EMPLOYMENT_STATUSES,
  TEACHER_EMPLOYMENT_TYPES,
  TEACHER_GENDERS,
} from './teacher-profile.types';
import {
  isExperienceYearsValid,
  isValidNormalizedTeacherCode,
  normalizeTeacherCode,
  normalizeWorkingDays,
  projectTeacherProfileCompleteness,
  validateWorkTimePair,
} from './teacher-profile.integrity';

describe('TeacherProfile integrity', () => {
  it('locks the accepted enum values', () => {
    expect(TEACHER_GENDERS).toEqual(['MALE', 'FEMALE']);
    expect(TEACHER_EMPLOYMENT_STATUSES).toEqual([
      'ACTIVE',
      'INACTIVE',
      'TERMINATED',
    ]);
    expect(TEACHER_EMPLOYMENT_TYPES).toEqual([
      'FULL_TIME',
      'PART_TIME',
      'CONTRACT',
    ]);
    expect(CANONICAL_TEACHER_WORK_DAYS).toEqual([
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ]);
  });

  it('normalizes codes without inventing an empty code', () => {
    expect(normalizeTeacherCode('  t  01\t')).toBe('T01');
    expect(normalizeTeacherCode(' \n ')).toBeNull();
    expect(normalizeTeacherCode(null)).toBeNull();
  });

  it('validates the normalized code representation', () => {
    expect(isValidNormalizedTeacherCode(null)).toBe(true);
    expect(isValidNormalizedTeacherCode('T01')).toBe(true);
    expect(isValidNormalizedTeacherCode('')).toBe(false);
    expect(isValidNormalizedTeacherCode('t01')).toBe(false);
    expect(isValidNormalizedTeacherCode('T 01')).toBe(false);
    expect(isValidNormalizedTeacherCode('T'.repeat(21))).toBe(false);
  });

  it('deduplicates and orders work days canonically', () => {
    expect(
      normalizeWorkingDays(['FRIDAY', 'SUNDAY', 'FRIDAY', 'MONDAY']),
    ).toEqual(['SUNDAY', 'MONDAY', 'FRIDAY']);
  });

  it('enforces the inclusive experience range', () => {
    expect(isExperienceYearsValid(null)).toBe(true);
    expect(isExperienceYearsValid(0)).toBe(true);
    expect(isExperienceYearsValid(60)).toBe(true);
    expect(isExperienceYearsValid(-1)).toBe(false);
    expect(isExperienceYearsValid(61)).toBe(false);
    expect(isExperienceYearsValid(1.5)).toBe(false);
  });

  it('enforces a paired, forward work-time window', () => {
    expect(validateWorkTimePair(null, null).isValid).toBe(true);
    expect(validateWorkTimePair('08:00', null).isPairValid).toBe(false);
    expect(validateWorkTimePair('08:00', '08:00').isOrderValid).toBe(false);
    expect(validateWorkTimePair('08:00', '15:30').isValid).toBe(true);
    expect(validateWorkTimePair('25:00', '26:00').isValid).toBe(false);
  });

  it('projects completeness only from canonical profile fields', () => {
    const incomplete = projectTeacherProfileCompleteness({
      teacherCode: null,
      firstNameAr: null,
      lastNameAr: null,
      firstNameEn: null,
      lastNameEn: null,
      gender: null,
    });

    expect(incomplete.isComplete).toBe(false);
    expect(incomplete.missingFields).toEqual([
      'teacherCode',
      'firstNameAr',
      'lastNameAr',
      'firstNameEn',
      'lastNameEn',
      'gender',
    ]);
    expect(
      projectTeacherProfileCompleteness({
        teacherCode: 'T01',
        firstNameAr: 'أ',
        lastNameAr: 'ب',
        firstNameEn: 'A',
        lastNameEn: 'B',
        gender: 'MALE',
      }).isComplete,
    ).toBe(true);
  });
});
