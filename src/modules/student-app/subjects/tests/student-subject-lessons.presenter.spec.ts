import { LessonContentItemType, LessonPlanItemStatus } from '@prisma/client';
import type { StudentAppContext } from '../../shared/student-app.types';
import type { StudentSubjectLessonItemRecord } from '../infrastructure/student-subject-lessons-read.adapter';
import {
  StudentSubjectLessonsPresenter,
  studentSubjectLessonOrderingPeriodIndex,
} from '../presenters/student-subject-lessons.presenter';

describe('StudentSubjectLessonsPresenter', () => {
  it.each([
    [LessonPlanItemStatus.PLANNED, 'planned'],
    [LessonPlanItemStatus.IN_PROGRESS, 'in_progress'],
    [LessonPlanItemStatus.DONE, 'done'],
    [LessonPlanItemStatus.SKIPPED, 'skipped'],
    [LessonPlanItemStatus.RESCHEDULED, 'rescheduled'],
    [LessonPlanItemStatus.CANCELLED, 'cancelled'],
  ] as const)(
    'maps %s through the Student lesson status contract',
    (status, api) => {
      const result = StudentSubjectLessonsPresenter.presentItem({
        context: contextFixture(),
        item: itemFixture({ status }),
      });

      expect(result.status).toBe(api);
    },
  );

  it('formats DATE values safely and presents a visible period', () => {
    const result = StudentSubjectLessonsPresenter.presentItem({
      context: contextFixture(),
      item: itemFixture(),
    });

    expect(result).toMatchObject({
      lessonPlanItemId: 'item',
      plannedDate: '2026-09-14',
      title: 'Item title',
      unit: { id: 'unit', title: 'Unit title', sortOrder: 1 },
      lesson: { id: 'lesson', title: 'Lesson title', sortOrder: 2 },
      period: { id: 'period', label: 'Period 1' },
    });
  });

  it('returns a null-field period object when the relation is absent or outside context', () => {
    const absent = StudentSubjectLessonsPresenter.presentItem({
      context: contextFixture(),
      item: itemFixture({ timetableEntry: null }),
    });
    const mismatched = StudentSubjectLessonsPresenter.presentItem({
      context: contextFixture(),
      item: itemFixture({
        timetableEntry: {
          academicYearId: 'other-year',
          termId: 'term',
          classroomId: 'classroom',
          period: { id: 'period', label: 'Period 1', periodIndex: 1 },
        },
      }),
    });

    expect(absent.period).toEqual({ id: null, label: null });
    expect(mismatched.period).toEqual({ id: null, label: null });
  });

  it('keeps response visibility separate from the raw database ordering period', () => {
    const mismatchedItem = itemFixture({
      timetableEntry: {
        academicYearId: 'other-year',
        termId: 'term',
        classroomId: 'classroom',
        period: { id: 'period', label: 'Period 7', periodIndex: 7 },
      },
    });

    expect(
      StudentSubjectLessonsPresenter.presentItem({
        context: contextFixture(),
        item: mismatchedItem,
      }).period,
    ).toEqual({ id: null, label: null });
    expect(studentSubjectLessonOrderingPeriodIndex(mismatchedItem)).toBe(7);
    expect(
      studentSubjectLessonOrderingPeriodIndex(
        itemFixture({ timetableEntry: null }),
      ),
    ).toBeNull();
  });

  it('computes the phase-1A content summary without treating FILE as playable video', () => {
    const result = StudentSubjectLessonsPresenter.presentItem({
      context: contextFixture(),
      item: itemFixture({
        lesson: {
          id: 'lesson',
          title: 'Lesson title',
          sortOrder: 2,
          contentItems: [
            { type: LessonContentItemType.TEXT, isRequired: true },
            { type: LessonContentItemType.VIDEO_LINK, isRequired: true },
            { type: LessonContentItemType.FILE, isRequired: false },
            { type: LessonContentItemType.EXTERNAL_LINK, isRequired: false },
          ],
        },
      }),
    });

    expect(result.contentSummary).toEqual({
      totalCount: 4,
      requiredCount: 2,
      videoCount: 1,
      fileCount: 1,
      hasPlayableVideo: false,
    });
  });

  it('returns only the locked safe response fields', () => {
    const result = StudentSubjectLessonsPresenter.presentPage({
      context: contextFixture(),
      items: [itemFixture()],
      nextCursor: 'opaque',
      hasNextPage: true,
    });

    expect(Object.keys(result).sort()).toEqual(['items', 'pageInfo']);
    expect(Object.keys(result.items[0]).sort()).toEqual(
      [
        'contentSummary',
        'lesson',
        'lessonPlanItemId',
        'period',
        'plannedDate',
        'status',
        'title',
        'unit',
      ].sort(),
    );

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'studentId',
      'enrollmentId',
      'academicYearId',
      'termId',
      'classroomId',
      'lessonPlanId',
      'curriculumId',
      'teacherUserId',
      'teacherSubjectAllocationId',
      'bodyText',
      'url',
      'fileId',
      'filename',
      'mimeType',
      'sizeBytes',
      'bucket',
      'objectKey',
      'checksum',
      'metadata',
      'notes',
      'createdBy',
      'updatedBy',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user',
    studentId: 'student',
    schoolId: 'school',
    organizationId: 'organization',
    membershipId: 'membership',
    roleId: 'role',
    permissions: [],
    enrollmentId: 'enrollment',
    classroomId: 'classroom',
    academicYearId: 'academic-year',
    termId: 'term',
  };
}

function itemFixture(
  overrides?: Partial<StudentSubjectLessonItemRecord>,
): StudentSubjectLessonItemRecord {
  return {
    id: 'item',
    plannedDate: new Date(Date.UTC(2026, 8, 14)),
    status: LessonPlanItemStatus.PLANNED,
    title: 'Item title',
    sortOrder: 3,
    unit: { id: 'unit', title: 'Unit title', sortOrder: 1 },
    lesson: {
      id: 'lesson',
      title: 'Lesson title',
      sortOrder: 2,
      contentItems: [],
    },
    timetableEntry: {
      academicYearId: 'academic-year',
      termId: 'term',
      classroomId: 'classroom',
      period: { id: 'period', label: 'Period 1', periodIndex: 1 },
    },
    ...overrides,
  } as StudentSubjectLessonItemRecord;
}
