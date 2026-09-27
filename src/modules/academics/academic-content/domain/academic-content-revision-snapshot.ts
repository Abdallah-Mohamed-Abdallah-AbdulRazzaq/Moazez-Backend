import { InternalServerErrorException } from '@nestjs/common';
import {
  AcademicContentType,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
} from '@prisma/client';

/** Frozen JSON contract for revisions captured with snapshotContractVersion 2. */
export type AcademicContentRevisionSnapshotV2 =
  | {
      type: typeof AcademicContentType.TEACHER_PREPARATION;
      state: {
        topic: string | null;
        objectives: string[];
        learningOutcomes: string[];
        teachingStrategies: string[];
        activities: string[];
        resourceNotes: string | null;
        assessmentNotes: string | null;
        teacherNotes: string | null;
        curriculumId: string | null;
        curriculumUnitId: string | null;
        curriculumLessonId: string | null;
        lessonPlanId: string | null;
        lessonPlanItemId: string | null;
        timetableEntryId: string | null;
      };
    }
  | {
      type: typeof AcademicContentType.WEEKLY_PLAN;
      state: {
        weekStartDate: string;
        weekEndDate: string;
        objectives: string[];
        topics: string[];
        expectedHomework: string | null;
        upcomingAssessments: string | null;
        notes: string | null;
        homeworkAssignmentIds: string[];
        gradeAssessmentIds: string[];
      };
    }
  | {
      type: typeof AcademicContentType.GUARDIAN_WEEKLY_NOTE;
      state: {
        body: string;
        priority: AcademicGuardianNotePriority;
        requiresAcknowledgement: boolean;
      };
    }
  | {
      type: typeof AcademicContentType.SUBJECT_RESOURCE;
      state: {
        resourceCategory: AcademicSubjectResourceCategory;
        curriculumId: string | null;
        curriculumUnitId: string | null;
        curriculumLessonId: string | null;
      };
    }
  | {
      type: typeof AcademicContentType.ONLINE_SESSION;
      state: {
        platform: AcademicOnlineSessionPlatform;
        providerName: string | null;
        joinUrl: string;
        accessCode: string | null;
        instructions: string | null;
        startAt: string;
        endAt: string;
        timezone: string;
        timetableEntryId: string | null;
      };
    };

const invalid = (): never => {
  throw new InternalServerErrorException(
    'Academic content revision snapshot is invalid',
  );
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
};
const string = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string') return invalid();
  return value;
};
const nullableString = (
  row: Record<string, unknown>,
  key: string,
): string | null => {
  const value = row[key];
  if (value !== null && typeof value !== 'string') return invalid();
  return value;
};
const strings = (row: Record<string, unknown>, key: string): string[] => {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    return invalid();
  return value;
};
const nullableId = (
  row: Record<string, unknown>,
  key: string,
): string | null => {
  const value = nullableString(row, key);
  if (
    value !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return invalid();
  return value;
};
const dateOnly = (row: Record<string, unknown>, key: string): string => {
  const value = string(row, key);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return invalid();
  return value;
};
const instant = (row: Record<string, unknown>, key: string): string => {
  const value = string(row, key);
  const date = new Date(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString() !== value
  )
    return invalid();
  return value;
};
const enumValue = <T extends string>(
  row: Record<string, unknown>,
  key: string,
  values: Record<string, T>,
): T => {
  const value = string(row, key);
  if (!Object.values(values).includes(value as T)) return invalid();
  return value as T;
};

/** Validates persisted V2 JSON and returns only fields owned by the frozen contract. */
export function decodeAcademicContentRevisionSnapshotV2(
  value: unknown,
  revisionType: AcademicContentType,
): AcademicContentRevisionSnapshotV2 {
  const snapshot = record(value);
  if (snapshot.type !== revisionType) return invalid();
  const state = record(snapshot.state);
  switch (revisionType) {
    case AcademicContentType.TEACHER_PREPARATION:
      return {
        type: revisionType,
        state: {
          topic: nullableString(state, 'topic'),
          objectives: strings(state, 'objectives'),
          learningOutcomes: strings(state, 'learningOutcomes'),
          teachingStrategies: strings(state, 'teachingStrategies'),
          activities: strings(state, 'activities'),
          resourceNotes: nullableString(state, 'resourceNotes'),
          assessmentNotes: nullableString(state, 'assessmentNotes'),
          teacherNotes: nullableString(state, 'teacherNotes'),
          curriculumId: nullableId(state, 'curriculumId'),
          curriculumUnitId: nullableId(state, 'curriculumUnitId'),
          curriculumLessonId: nullableId(state, 'curriculumLessonId'),
          lessonPlanId: nullableId(state, 'lessonPlanId'),
          lessonPlanItemId: nullableId(state, 'lessonPlanItemId'),
          timetableEntryId: nullableId(state, 'timetableEntryId'),
        },
      };
    case AcademicContentType.WEEKLY_PLAN:
      return {
        type: revisionType,
        state: {
          weekStartDate: dateOnly(state, 'weekStartDate'),
          weekEndDate: dateOnly(state, 'weekEndDate'),
          objectives: strings(state, 'objectives'),
          topics: strings(state, 'topics'),
          expectedHomework: nullableString(state, 'expectedHomework'),
          upcomingAssessments: nullableString(state, 'upcomingAssessments'),
          notes: nullableString(state, 'notes'),
          homeworkAssignmentIds: strings(state, 'homeworkAssignmentIds'),
          gradeAssessmentIds: strings(state, 'gradeAssessmentIds'),
        },
      };
    case AcademicContentType.GUARDIAN_WEEKLY_NOTE: {
      const requiresAcknowledgement = state.requiresAcknowledgement;
      if (typeof requiresAcknowledgement !== 'boolean') return invalid();
      return {
        type: revisionType,
        state: {
          body: string(state, 'body'),
          priority: enumValue(state, 'priority', AcademicGuardianNotePriority),
          requiresAcknowledgement,
        },
      };
    }
    case AcademicContentType.SUBJECT_RESOURCE:
      return {
        type: revisionType,
        state: {
          resourceCategory: enumValue(
            state,
            'resourceCategory',
            AcademicSubjectResourceCategory,
          ),
          curriculumId: nullableId(state, 'curriculumId'),
          curriculumUnitId: nullableId(state, 'curriculumUnitId'),
          curriculumLessonId: nullableId(state, 'curriculumLessonId'),
        },
      };
    case AcademicContentType.ONLINE_SESSION:
      return {
        type: revisionType,
        state: {
          platform: enumValue(state, 'platform', AcademicOnlineSessionPlatform),
          providerName: nullableString(state, 'providerName'),
          joinUrl: string(state, 'joinUrl'),
          accessCode: nullableString(state, 'accessCode'),
          instructions: nullableString(state, 'instructions'),
          startAt: instant(state, 'startAt'),
          endAt: instant(state, 'endAt'),
          timezone: string(state, 'timezone'),
          timetableEntryId: nullableId(state, 'timetableEntryId'),
        },
      };
    case AcademicContentType.GENERAL_RESOURCE:
      return invalid();
  }
}
