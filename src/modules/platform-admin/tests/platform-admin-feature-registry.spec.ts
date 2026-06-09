import {
  assertPlatformSchoolFeatureKey,
  isPlatformSchoolFeatureKey,
  PLATFORM_SCHOOL_FEATURES,
} from '../domain/platform-admin-feature-registry';
import { PlatformFeatureUnknownException } from '../domain/platform-admin-errors';

describe('Platform Admin feature registry', () => {
  it('registers stable lowercase snake_case feature keys', () => {
    expect(PLATFORM_SCHOOL_FEATURES.map((feature) => feature.featureKey)).toEqual([
      'dashboard',
      'admissions',
      'students',
      'academics',
      'attendance',
      'grades',
      'homework',
      'reinforcement',
      'behavior',
      'communication',
      'teacher_app',
      'student_app',
      'parent_app',
      'applicant_portal',
      'schedule_timetable',
    ]);

    for (const feature of PLATFORM_SCHOOL_FEATURES) {
      expect(feature.featureKey).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(feature.label).toEqual(expect.any(String));
      expect(feature.category).toEqual(expect.any(String));
    }
  });

  it('rejects unknown feature keys', () => {
    expect(isPlatformSchoolFeatureKey('dashboard')).toBe(true);
    expect(isPlatformSchoolFeatureKey('billing')).toBe(false);
    expect(() => assertPlatformSchoolFeatureKey('billing')).toThrow(
      PlatformFeatureUnknownException,
    );
    expect(() => assertPlatformSchoolFeatureKey('teacher-app')).toThrow(
      PlatformFeatureUnknownException,
    );
  });
});
