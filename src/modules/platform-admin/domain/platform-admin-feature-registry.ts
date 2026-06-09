import { PlatformFeatureUnknownException } from './platform-admin-errors';

export type PlatformSchoolFeatureCategory =
  | 'school_dashboard'
  | 'school_operations'
  | 'apps'
  | 'portals';

export interface PlatformSchoolFeatureDefinition {
  featureKey: PlatformSchoolFeatureKey;
  label: string;
  category: PlatformSchoolFeatureCategory;
}

export const PLATFORM_SCHOOL_FEATURES = [
  {
    featureKey: 'dashboard',
    label: 'Dashboard',
    category: 'school_dashboard',
  },
  {
    featureKey: 'admissions',
    label: 'Admissions',
    category: 'school_operations',
  },
  {
    featureKey: 'students',
    label: 'Students',
    category: 'school_operations',
  },
  {
    featureKey: 'academics',
    label: 'Academics',
    category: 'school_operations',
  },
  {
    featureKey: 'attendance',
    label: 'Attendance',
    category: 'school_operations',
  },
  {
    featureKey: 'grades',
    label: 'Grades',
    category: 'school_operations',
  },
  {
    featureKey: 'homework',
    label: 'Homework',
    category: 'school_operations',
  },
  {
    featureKey: 'reinforcement',
    label: 'Reinforcement',
    category: 'school_operations',
  },
  {
    featureKey: 'behavior',
    label: 'Behavior',
    category: 'school_operations',
  },
  {
    featureKey: 'communication',
    label: 'Communication',
    category: 'school_operations',
  },
  {
    featureKey: 'teacher_app',
    label: 'Teacher App',
    category: 'apps',
  },
  {
    featureKey: 'student_app',
    label: 'Student App',
    category: 'apps',
  },
  {
    featureKey: 'parent_app',
    label: 'Parent App',
    category: 'apps',
  },
  {
    featureKey: 'applicant_portal',
    label: 'Applicant Portal',
    category: 'portals',
  },
  {
    featureKey: 'schedule_timetable',
    label: 'Schedule & Timetable',
    category: 'school_operations',
  },
] as const satisfies readonly {
  featureKey: string;
  label: string;
  category: PlatformSchoolFeatureCategory;
}[];

export type PlatformSchoolFeatureKey =
  (typeof PLATFORM_SCHOOL_FEATURES)[number]['featureKey'];

const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const FEATURE_DEFINITIONS_BY_KEY = new Map<string, PlatformSchoolFeatureDefinition>(
  PLATFORM_SCHOOL_FEATURES.map((definition) => [
    definition.featureKey,
    definition,
  ]),
);

export function isPlatformSchoolFeatureKey(
  featureKey: string,
): featureKey is PlatformSchoolFeatureKey {
  return FEATURE_DEFINITIONS_BY_KEY.has(featureKey);
}

export function assertPlatformSchoolFeatureKey(
  featureKey: string,
): PlatformSchoolFeatureKey {
  if (!FEATURE_KEY_PATTERN.test(featureKey) || !isPlatformSchoolFeatureKey(featureKey)) {
    throw new PlatformFeatureUnknownException(featureKey);
  }

  return featureKey;
}

export function getPlatformSchoolFeatureDefinition(
  featureKey: PlatformSchoolFeatureKey,
): PlatformSchoolFeatureDefinition {
  return FEATURE_DEFINITIONS_BY_KEY.get(featureKey)!;
}

export function listPlatformSchoolFeatureDefinitions(): PlatformSchoolFeatureDefinition[] {
  return PLATFORM_SCHOOL_FEATURES.map((definition) => ({ ...definition }));
}
