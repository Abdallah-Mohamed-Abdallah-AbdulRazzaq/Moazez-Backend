export const TEACHER_ANNOUNCEMENT_AUDIENCES = [
  'students',
  'parents',
  'students_and_parents',
] as const;

export const TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE = 'teacher_app' as const;

export type TeacherAnnouncementAudience =
  (typeof TEACHER_ANNOUNCEMENT_AUDIENCES)[number];

export interface TeacherAppAnnouncementTarget {
  type: 'classroom';
  classId: string;
  classroomId: string;
  label: string;
}

export interface TeacherAnnouncementAppMetadata extends Record<
  string,
  unknown
> {
  teacherApp: {
    source: typeof TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE;
    targetType: 'classroom';
    classId: string;
    classroomId: string;
    label: string;
    audience: TeacherAnnouncementAudience;
  };
}

export function buildTeacherAnnouncementMetadata(params: {
  target: TeacherAppAnnouncementTarget;
  audience: TeacherAnnouncementAudience;
}): TeacherAnnouncementAppMetadata {
  return {
    teacherApp: {
      source: TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
      targetType: params.target.type,
      classId: params.target.classId,
      classroomId: params.target.classroomId,
      label: params.target.label,
      audience: params.audience,
    },
  };
}

export function parseTeacherAnnouncementMetadata(
  value: unknown,
): TeacherAnnouncementAppMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const teacherApp = (value as Record<string, unknown>).teacherApp;
  if (
    !teacherApp ||
    typeof teacherApp !== 'object' ||
    Array.isArray(teacherApp)
  ) {
    return null;
  }

  const metadata = teacherApp as Record<string, unknown>;
  if (metadata.source !== TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE) return null;
  if (metadata.targetType !== 'classroom') return null;
  if (typeof metadata.classId !== 'string') return null;
  if (typeof metadata.classroomId !== 'string') return null;
  if (typeof metadata.label !== 'string') return null;
  if (!isTeacherAnnouncementAudience(metadata.audience)) return null;

  return {
    teacherApp: {
      source: TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
      targetType: 'classroom',
      classId: metadata.classId,
      classroomId: metadata.classroomId,
      label: metadata.label,
      audience: metadata.audience,
    },
  };
}

export function isTeacherAnnouncementAudience(
  value: unknown,
): value is TeacherAnnouncementAudience {
  return (
    typeof value === 'string' &&
    (TEACHER_ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(value)
  );
}
