import {
  CurriculumStatus,
  LessonContentItemType,
  LessonPlanItemStatus,
  LessonPlanStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppCurrentStudentWithEnrollment } from '../../shared/student-app.types';
import { StudentScheduleReadAdapter } from '../../schedule/infrastructure/student-schedule-read.adapter';
import { GetStudentLessonDetailUseCase } from '../application/get-student-lesson-detail.use-case';
import { GetStudentLessonsTodayUseCase } from '../application/get-student-lessons-today.use-case';
import { GetStudentLessonsWeekUseCase } from '../application/get-student-lessons-week.use-case';
import {
  StudentLessonItemRecord,
  StudentLessonsReadAdapter,
} from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonsPresenter } from '../presenters/student-lessons.presenter';

describe('Student lessons use cases', () => {
  it('returns today lessons for the active-enrollment classroom', async () => {
    const { todayUseCase, lessonsReadAdapter } = createUseCases({
      items: [lessonItemFixture()],
    });

    const result = await todayUseCase.execute({ date: '2026-09-14' });

    expect(lessonsReadAdapter.listItemsForStudentOnDate).toHaveBeenCalledWith({
      context: currentStudent().context,
      date: new Date(Date.UTC(2026, 8, 14)),
    });
    expect(result).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          lessonPlanItemId: 'item-1',
          lessonPlanId: 'plan-1',
          timetableEntryId: 'entry-1',
          plannedDate: '2026-09-14',
          status: 'planned',
          title: 'Algebra warmup',
        }),
      ],
    });
  });

  it('returns an empty today response when there are no visible lessons', async () => {
    const { todayUseCase } = createUseCases({ items: [] });

    await expect(
      todayUseCase.execute({ date: '2026-09-15' }),
    ).resolves.toEqual({
      date: '2026-09-15',
      dayOfWeek: 2,
      items: [],
    });
  });

  it('groups week lessons using Student schedule week settings', async () => {
    const { weekUseCase, scheduleReadAdapter } = createUseCases({
      items: [
        lessonItemFixture({
          id: 'monday-item',
          plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        }),
        lessonItemFixture({
          id: 'wednesday-item',
          plannedDate: new Date('2026-09-16T00:00:00.000Z'),
          dayOfWeek: 3,
        }),
      ],
      weekStartDay: 1,
    });

    const result = await weekUseCase.execute({ date: '2026-09-16' });

    expect(scheduleReadAdapter.findPublishedScheduleSettings).toHaveBeenCalledWith(
      {
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    );
    expect(result.weekStartDate).toBe('2026-09-14');
    expect(result.weekEndDate).toBe('2026-09-20');
    expect(result.days).toHaveLength(7);
    expect(result.days[0].items).toEqual([
      expect.objectContaining({ lessonPlanItemId: 'monday-item' }),
    ]);
    expect(result.days[2].items).toEqual([
      expect.objectContaining({ lessonPlanItemId: 'wednesday-item' }),
    ]);
  });

  it('returns one visible detail item with safe content', async () => {
    const { detailUseCase, lessonsReadAdapter } = createUseCases({
      item: lessonItemFixture(),
    });

    const result = await detailUseCase.execute('item-1');

    expect(lessonsReadAdapter.findVisibleItemById).toHaveBeenCalledWith({
      context: currentStudent().context,
      itemId: 'item-1',
    });
    expect(result.content).toEqual([
      expect.objectContaining({
        contentItemId: 'content-text',
        type: 'text',
        bodyText: 'Visible student content',
        file: null,
        isRequired: true,
        estimatedMinutes: 10,
      }),
      expect.objectContaining({
        contentItemId: 'content-file',
        type: 'file',
        file: {
          fileId: 'file-1',
          filename: 'lesson.pdf',
          mimeType: 'application/pdf',
          sizeBytes: '2048',
        },
      }),
    ]);
  });

  it('hides missing, another-classroom, cross-school, archived, or deleted details as not found', async () => {
    const { detailUseCase } = createUseCases({ item: null });

    await expect(detailUseCase.execute('hidden-item')).rejects.toMatchObject({
      code: 'student_app.lessons.not_found',
    });
  });
});

describe('StudentLessonsPresenter', () => {
  it('does not expose teacher notes, tenant fields, or storage internals', () => {
    const result = StudentLessonsPresenter.presentItem(
      lessonItemFixture() as unknown as StudentLessonItemRecord,
    );
    const json = JSON.stringify(result);

    expect(json).not.toContain('teacher-only note');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
    expect(json).not.toContain('membershipId');
    expect(json).not.toContain('deletedAt');
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('uploaderId');
    expect(json).not.toContain('metadata');
  });

  it('suppresses timetable period details when the linked entry is outside the visible lesson scope', () => {
    const result = StudentLessonsPresenter.presentItem(
      lessonItemFixture({
        timetableEntry: {
          ...lessonItemFixture().timetableEntry,
          classroomId: 'another-classroom',
        },
      }) as unknown as StudentLessonItemRecord,
    );

    expect(result.period).toBeNull();
  });
});

describe('StudentLessonsReadAdapter', () => {
  it('queries scoped Prisma for active lesson-plan items in the student enrollment scope', async () => {
    const findMany = jest.fn().mockResolvedValue([lessonItemFixture()]);
    const adapter = new StudentLessonsReadAdapter({
      scoped: {
        lessonPlanItem: {
          findMany,
        },
      },
    } as never);

    await adapter.listItemsForStudentOnDate({
      context: currentStudent().context,
      date: new Date(Date.UTC(2026, 8, 14)),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: 'school-1',
          deletedAt: null,
          plannedDate: new Date(Date.UTC(2026, 8, 14)),
          lessonPlan: {
            is: expect.objectContaining({
              schoolId: 'school-1',
              academicYearId: 'year-1',
              termId: 'term-1',
              classroomId: 'classroom-1',
              status: LessonPlanStatus.ACTIVE,
              deletedAt: null,
            }),
          },
          curriculum: {
            is: expect.objectContaining({
              status: CurriculumStatus.ACTIVE,
              deletedAt: null,
            }),
          },
        }),
      }),
    );
  });

  it('does not query lesson-plan items when the current enrollment has no term context', async () => {
    const findMany = jest.fn();
    const adapter = new StudentLessonsReadAdapter({
      scoped: {
        lessonPlanItem: {
          findMany,
        },
      },
    } as never);

    await expect(
      adapter.listItemsForStudentOnDate({
        context: {
          ...currentStudent().context,
          termId: null,
        },
        date: new Date(Date.UTC(2026, 8, 14)),
      }),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

function createUseCases(params?: {
  items?: StudentLessonItemRecord[];
  item?: StudentLessonItemRecord | null;
  weekStartDay?: number;
}): {
  todayUseCase: GetStudentLessonsTodayUseCase;
  weekUseCase: GetStudentLessonsWeekUseCase;
  detailUseCase: GetStudentLessonDetailUseCase;
  lessonsReadAdapter: jest.Mocked<StudentLessonsReadAdapter>;
  scheduleReadAdapter: jest.Mocked<StudentScheduleReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn().mockResolvedValue(currentStudent()),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const lessonsReadAdapter = {
    listItemsForStudentOnDate: jest.fn().mockResolvedValue(params?.items ?? []),
    listItemsForStudentDateRange: jest
      .fn()
      .mockResolvedValue(params?.items ?? []),
    findVisibleItemById: jest
      .fn()
      .mockResolvedValue(
        params && 'item' in params ? params.item : lessonItemFixture(),
      ),
  } as unknown as jest.Mocked<StudentLessonsReadAdapter>;
  const scheduleReadAdapter = {
    findPublishedScheduleSettings: jest.fn().mockResolvedValue(
      params?.weekStartDay === undefined
        ? null
        : { weekStartDay: params.weekStartDay },
    ),
  } as unknown as jest.Mocked<StudentScheduleReadAdapter>;

  return {
    todayUseCase: new GetStudentLessonsTodayUseCase(
      accessService,
      lessonsReadAdapter,
    ),
    weekUseCase: new GetStudentLessonsWeekUseCase(
      accessService,
      lessonsReadAdapter,
      scheduleReadAdapter,
    ),
    detailUseCase: new GetStudentLessonDetailUseCase(
      accessService,
      lessonsReadAdapter,
    ),
    lessonsReadAdapter,
    scheduleReadAdapter,
  };
}

function currentStudent(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: {
      studentUserId: 'student-user-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    },
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function lessonItemFixture(
  overrides?: Partial<StudentLessonItemRecord>,
): StudentLessonItemRecord {
  return {
    id: 'item-1',
    lessonPlanId: 'plan-1',
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    lessonId: 'lesson-1',
    timetableEntryId: 'entry-1',
    plannedDate: new Date('2026-09-14T00:00:00.000Z'),
    dayOfWeek: 1,
    periodId: 'period-1',
    periodLabel: 'Period 1',
    title: 'Algebra warmup',
    status: LessonPlanItemStatus.PLANNED,
    sortOrder: 1,
    curriculum: {
      id: 'curriculum-1',
      title: 'Math Term 1',
      status: CurriculumStatus.ACTIVE,
      deletedAt: null,
    },
    unit: {
      id: 'unit-1',
      title: 'Unit 1',
      sortOrder: 1,
      deletedAt: null,
    },
    lesson: {
      id: 'lesson-1',
      title: 'Lesson 1',
      objectives: ['objective'],
      sortOrder: 1,
      deletedAt: null,
      contentItems: [
        {
          id: 'content-text',
          type: LessonContentItemType.TEXT,
          title: 'Warmup',
          bodyText: 'Visible student content',
          url: null,
          sortOrder: 1,
          isRequired: true,
          estimatedMinutes: 10,
          file: null,
        },
        {
          id: 'content-file',
          type: LessonContentItemType.FILE,
          title: 'Worksheet',
          bodyText: null,
          url: null,
          sortOrder: 2,
          isRequired: false,
          estimatedMinutes: null,
          file: {
            id: 'file-1',
            originalName: 'lesson.pdf',
            mimeType: 'application/pdf',
            sizeBytes: BigInt(2048),
            deletedAt: null,
          },
        },
      ],
    },
    lessonPlan: {
      id: 'plan-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      subjectId: 'subject-1',
      status: LessonPlanStatus.ACTIVE,
      deletedAt: null,
      subject: {
        id: 'subject-1',
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
        color: '#3366ff',
        isActive: true,
        deletedAt: null,
      },
      classroom: {
        id: 'classroom-1',
        nameAr: 'Classroom AR',
        nameEn: 'Classroom',
        deletedAt: null,
      },
    },
    timetableEntry: {
      id: 'entry-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      dayOfWeek: 1,
      period: {
        id: 'period-1',
        label: 'Period 1',
        periodIndex: 1,
        startTime: '08:00',
        endTime: '08:45',
        isInstructional: true,
      },
    },
    ...overrides,
  } as unknown as StudentLessonItemRecord;
}
