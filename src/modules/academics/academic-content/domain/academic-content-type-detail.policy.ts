import {
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
  AcademicContentType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = (field: string): never => {
  throw new ValidationDomainException(`Invalid ${field}`);
};

export function optionalText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return invalid(field);
  const text = value.trim();
  if (text.length > max) return invalid(field);
  return text || null;
}

export function requiredText(
  value: unknown,
  field: string,
  max: number,
): string {
  const text = optionalText(value, field, max);
  if (!text) return invalid(field);
  return text;
}

export function orderedText(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 50) return invalid(field);
  return Array.from(value, (item: unknown) => {
    if (typeof item !== 'string') return invalid(field);
    const text = item.trim().replace(/\s+/gu, ' ');
    if (!text || text.length > 500) return invalid(field);
    return text;
  });
}

export function optionalId(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !uuid.test(value)) return invalid(field);
  return value.toLowerCase();
}

export function referenceIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100) return invalid(field);
  return [
    ...new Set(
      value.map((item) => {
        const id = optionalId(item, field);
        if (!id) return invalid(field);
        return id;
      }),
    ),
  ].sort();
}

export function dateOnly(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return invalid(field);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return invalid(field);
  return value;
}

export function instant(value: unknown, field: string): string {
  if (!(value instanceof Date) && typeof value !== 'string')
    return invalid(field);
  if (
    typeof value === 'string' &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    )
  )
    return invalid(field);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return invalid(field);
  return date.toISOString();
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T {
  if (!values.includes(value as T)) return invalid(field);
  return value as T;
}

export type PreparationCommand = {
  topic?: string | null;
  objectives: string[];
  learningOutcomes: string[];
  teachingStrategies: string[];
  activities: string[];
  resourceNotes?: string | null;
  assessmentNotes?: string | null;
  teacherNotes?: string | null;
  curriculumId?: string | null;
  curriculumUnitId?: string | null;
  curriculumLessonId?: string | null;
  lessonPlanId?: string | null;
  lessonPlanItemId?: string | null;
  timetableEntryId?: string | null;
};
export type WeeklyPlanCommand = {
  weekStartDate: string;
  weekEndDate: string;
  objectives: string[];
  topics: string[];
  expectedHomework?: string | null;
  upcomingAssessments?: string | null;
  notes?: string | null;
  homeworkAssignmentIds: string[];
  gradeAssessmentIds: string[];
};
export type GuardianNoteCommand = {
  body: string;
  priority: AcademicGuardianNotePriority;
  requiresAcknowledgement: boolean;
};
export type SubjectResourceCommand = {
  resourceCategory: AcademicSubjectResourceCategory;
  curriculumId?: string | null;
  curriculumUnitId?: string | null;
  curriculumLessonId?: string | null;
};
export type OnlineSessionCommand = {
  platform: AcademicOnlineSessionPlatform;
  providerName?: string | null;
  joinUrl: string;
  accessCode?: string | null;
  instructions?: string | null;
  startAt: string | Date;
  endAt: string | Date;
  timezone: string;
  timetableEntryId?: string | null;
};

export type NormalizedDetail =
  | { type: 'TEACHER_PREPARATION'; state: Required<PreparationCommand> }
  | { type: 'WEEKLY_PLAN'; state: Required<WeeklyPlanCommand> }
  | { type: 'GUARDIAN_WEEKLY_NOTE'; state: GuardianNoteCommand }
  | { type: 'SUBJECT_RESOURCE'; state: Required<SubjectResourceCommand> }
  | {
      type: 'ONLINE_SESSION';
      state: Omit<Required<OnlineSessionCommand>, 'startAt' | 'endAt'> & {
        startAt: string;
        endAt: string;
      };
    };

export function normalizePreparation(
  c: PreparationCommand,
): Extract<NormalizedDetail, { type: 'TEACHER_PREPARATION' }> {
  if (!c || typeof c !== 'object') return invalid('preparation');
  return {
    type: AcademicContentType.TEACHER_PREPARATION,
    state: {
      topic: optionalText(c.topic, 'topic', 500),
      objectives: orderedText(c.objectives, 'objectives'),
      learningOutcomes: orderedText(c.learningOutcomes, 'learningOutcomes'),
      teachingStrategies: orderedText(
        c.teachingStrategies,
        'teachingStrategies',
      ),
      activities: orderedText(c.activities, 'activities'),
      resourceNotes: optionalText(c.resourceNotes, 'resourceNotes', 4000),
      assessmentNotes: optionalText(c.assessmentNotes, 'assessmentNotes', 4000),
      teacherNotes: optionalText(c.teacherNotes, 'teacherNotes', 4000),
      curriculumId: optionalId(c.curriculumId, 'curriculumId'),
      curriculumUnitId: optionalId(c.curriculumUnitId, 'curriculumUnitId'),
      curriculumLessonId: optionalId(
        c.curriculumLessonId,
        'curriculumLessonId',
      ),
      lessonPlanId: optionalId(c.lessonPlanId, 'lessonPlanId'),
      lessonPlanItemId: optionalId(c.lessonPlanItemId, 'lessonPlanItemId'),
      timetableEntryId: optionalId(c.timetableEntryId, 'timetableEntryId'),
    },
  };
}

export function normalizeWeeklyPlan(
  c: WeeklyPlanCommand,
): Extract<NormalizedDetail, { type: 'WEEKLY_PLAN' }> {
  if (!c || typeof c !== 'object') return invalid('weeklyPlan');
  const weekStartDate = dateOnly(c.weekStartDate, 'weekStartDate');
  const weekEndDate = dateOnly(c.weekEndDate, 'weekEndDate');
  if (weekStartDate > weekEndDate) return invalid('week date range');
  return {
    type: AcademicContentType.WEEKLY_PLAN,
    state: {
      weekStartDate,
      weekEndDate,
      objectives: orderedText(c.objectives, 'objectives'),
      topics: orderedText(c.topics, 'topics'),
      expectedHomework: optionalText(
        c.expectedHomework,
        'expectedHomework',
        4000,
      ),
      upcomingAssessments: optionalText(
        c.upcomingAssessments,
        'upcomingAssessments',
        4000,
      ),
      notes: optionalText(c.notes, 'notes', 4000),
      homeworkAssignmentIds: referenceIds(
        c.homeworkAssignmentIds,
        'homeworkAssignmentIds',
      ),
      gradeAssessmentIds: referenceIds(
        c.gradeAssessmentIds,
        'gradeAssessmentIds',
      ),
    },
  };
}

export function normalizeGuardianNote(
  c: GuardianNoteCommand,
): Extract<NormalizedDetail, { type: 'GUARDIAN_WEEKLY_NOTE' }> {
  if (!c || typeof c !== 'object') return invalid('guardianNote');
  if (typeof c.requiresAcknowledgement !== 'boolean')
    return invalid('requiresAcknowledgement');
  return {
    type: AcademicContentType.GUARDIAN_WEEKLY_NOTE,
    state: {
      body: requiredText(c.body, 'body', 10000),
      priority: enumValue(
        c.priority,
        Object.values(AcademicGuardianNotePriority),
        'priority',
      ),
      requiresAcknowledgement: c.requiresAcknowledgement,
    },
  };
}

export function normalizeSubjectResource(
  c: SubjectResourceCommand,
): Extract<NormalizedDetail, { type: 'SUBJECT_RESOURCE' }> {
  if (!c || typeof c !== 'object') return invalid('subjectResource');
  return {
    type: AcademicContentType.SUBJECT_RESOURCE,
    state: {
      resourceCategory: enumValue(
        c.resourceCategory,
        Object.values(AcademicSubjectResourceCategory),
        'resourceCategory',
      ),
      curriculumId: optionalId(c.curriculumId, 'curriculumId'),
      curriculumUnitId: optionalId(c.curriculumUnitId, 'curriculumUnitId'),
      curriculumLessonId: optionalId(
        c.curriculumLessonId,
        'curriculumLessonId',
      ),
    },
  };
}

export function normalizeOnlineSession(
  c: OnlineSessionCommand,
): Extract<NormalizedDetail, { type: 'ONLINE_SESSION' }> {
  if (!c || typeof c !== 'object') return invalid('onlineSession');
  const platform = enumValue(
    c.platform,
    Object.values(AcademicOnlineSessionPlatform),
    'platform',
  );
  const providerName = optionalText(c.providerName, 'providerName', 180);
  if (platform === AcademicOnlineSessionPlatform.OTHER && !providerName)
    return invalid('providerName');
  const joinUrl = requiredText(c.joinUrl, 'joinUrl', 2048);
  try {
    const url = new URL(joinUrl);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return invalid('joinUrl');
  } catch {
    return invalid('joinUrl');
  }
  const startAt = instant(c.startAt, 'startAt');
  const endAt = instant(c.endAt, 'endAt');
  if (startAt >= endAt) return invalid('session interval');
  const timezone = requiredText(c.timezone, 'timezone', 100);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return invalid('timezone');
  }
  return {
    type: AcademicContentType.ONLINE_SESSION,
    state: {
      platform,
      providerName,
      joinUrl,
      accessCode: optionalText(c.accessCode, 'accessCode', 255),
      instructions: optionalText(c.instructions, 'instructions', 4000),
      startAt,
      endAt,
      timezone,
      timetableEntryId: optionalId(c.timetableEntryId, 'timetableEntryId'),
    },
  };
}
