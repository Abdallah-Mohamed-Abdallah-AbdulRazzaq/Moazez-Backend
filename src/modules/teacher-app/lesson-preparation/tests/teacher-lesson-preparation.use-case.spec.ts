import {
  CurriculumStatus,
  LessonContentItemType,
  LessonPlanItemStatus,
  LessonPlanStatus,
} from '@prisma/client';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherLessonPreparationStatusDto } from '../dto/teacher-lesson-preparation.dto';
import { TeacherLessonPreparationNotFoundException } from '../domain/teacher-lesson-preparation.errors';
import { GetTeacherLessonPreparationDetailUseCase } from '../application/get-teacher-lesson-preparation-detail.use-case';
import { GetTeacherLessonPreparationTodayUseCase } from '../application/get-teacher-lesson-preparation-today.use-case';
import { GetTeacherLessonPreparationWeekUseCase } from '../application/get-teacher-lesson-preparation-week.use-case';
import { UpdateTeacherLessonPreparationStatusUseCase } from '../application/update-teacher-lesson-preparation-status.use-case';
import {
  TeacherLessonPreparationItemRecord,
  TeacherLessonPreparationReadAdapter,
} from '../infrastructure/teacher-lesson-preparation-read.adapter';
import { TeacherLessonPreparationPresenter } from '../presenters/teacher-lesson-preparation.presenter';

const TEACHER_ID = 'teacher-1';
const SCHOOL_ID = 'school-1';

describe('Teacher lesson preparation use cases', () => {
  it('returns only teacher-owned planned items for the requested date', async () => {
    const { todayUseCase, readAdapter } = createUseCases({
      items: [itemFixture()],
    });

    const result = await todayUseCase.execute({ date: '2026-09-14' });

    expect(readAdapter.listItemsForTeacherOnDate).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
      allocationIds: ['allocation-1'],
      date: new Date(Date.UTC(2026, 8, 14)),
    });
    expect(result).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          lessonPlanItemId: 'item-1',
          teacherSubjectAllocationId: 'allocation-1',
          status: 'planned',
          title: 'Fractions warmup',
        }),
      ],
    });
    expect(result.items[0].content).toEqual([
      expect.objectContaining({
        contentItemId: 'content-1',
        type: 'text',
        title: 'Warmup',
        bodyText: 'Read pages 1-2',
      }),
      expect.objectContaining({
        contentItemId: 'content-file',
        type: 'file',
        file: {
          fileId: 'file-1',
          filename: 'worksheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: '1234',
        },
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('organizationId');
    expect(JSON.stringify(result)).not.toContain('deletedAt');
  });

  it('groups teacher-owned items by week day and keeps empty days', async () => {
    const { weekUseCase } = createUseCases({
      items: [
        itemFixture({ id: 'monday-item', plannedDate: utcDate('2026-09-14') }),
        itemFixture({
          id: 'wednesday-item',
          plannedDate: utcDate('2026-09-16'),
          dayOfWeek: 3,
        }),
      ],
    });

    const result = await weekUseCase.execute({ date: '2026-09-16' });

    expect(result.weekStartDate).toBe('2026-09-13');
    expect(result.weekEndDate).toBe('2026-09-19');
    expect(result.days).toHaveLength(7);
    expect(result.days.find((day) => day.date === '2026-09-14')?.items).toEqual(
      [expect.objectContaining({ lessonPlanItemId: 'monday-item' })],
    );
    expect(result.days.find((day) => day.date === '2026-09-16')?.items).toEqual(
      [expect.objectContaining({ lessonPlanItemId: 'wednesday-item' })],
    );
    expect(result.days.find((day) => day.date === '2026-09-17')?.items).toEqual(
      [],
    );
  });

  it('returns one owned detail with curriculum lesson content', async () => {
    const { detailUseCase, readAdapter } = createUseCases({
      detailItem: itemFixture(),
    });

    const result = await detailUseCase.execute('item-1');

    expect(readAdapter.findOwnedItemById).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
      allocationIds: ['allocation-1'],
      itemId: 'item-1',
      includeArchivedPlan: true,
    });
    expect(result.lesson).toMatchObject({
      id: 'lesson-1',
      title: 'Lesson 1',
      objectives: ['Objective 1'],
    });
  });

  it('hides another teacher item behind the Teacher App not-found pattern', async () => {
    const { detailUseCase } = createUseCases({ detailItem: null });

    await expect(detailUseCase.execute('other-item')).rejects.toMatchObject({
      code: 'teacher_app.lesson_preparation.not_found',
    });
  });

  it('updates an owned item to in progress with notes', async () => {
    const { statusUseCase, readAdapter } = createUseCases({
      detailItem: itemFixture(),
      updatedItem: itemFixture({
        status: LessonPlanItemStatus.IN_PROGRESS,
        notes: 'Ready for class',
      }),
    });

    const result = await statusUseCase.execute('item-1', {
      status: TeacherLessonPreparationStatusDto.IN_PROGRESS,
      notes: ' Ready for class ',
    });

    expect(readAdapter.updateItemStatus).toHaveBeenCalledWith({
      itemId: 'item-1',
      status: LessonPlanItemStatus.IN_PROGRESS,
      notes: ' Ready for class ',
      updatedByUserId: TEACHER_ID,
    });
    expect(result.status).toBe('in_progress');
    expect(result.notes).toBe('Ready for class');
  });

  it('updates an owned item to done', async () => {
    const { statusUseCase } = createUseCases({
      detailItem: itemFixture({ status: LessonPlanItemStatus.IN_PROGRESS }),
      updatedItem: itemFixture({ status: LessonPlanItemStatus.DONE }),
    });

    await expect(
      statusUseCase.execute('item-1', {
        status: TeacherLessonPreparationStatusDto.DONE,
      }),
    ).resolves.toMatchObject({ status: 'done' });
  });

  it('rejects unsupported prepared and cancelled statuses', async () => {
    const { statusUseCase, readAdapter } = createUseCases();

    await expect(
      statusUseCase.execute('item-1', { status: 'prepared' } as never),
    ).rejects.toMatchObject({
      code: 'teacher_app.lesson_preparation.invalid_status',
    });
    await expect(
      statusUseCase.execute('item-1', { status: 'cancelled' } as never),
    ).rejects.toMatchObject({
      code: 'teacher_app.lesson_preparation.invalid_status',
    });
    expect(readAdapter.updateItemStatus).not.toHaveBeenCalled();
  });

  it('rejects closed-term and archived lesson-plan status writes', async () => {
    await expect(
      createUseCases({
        detailItem: itemFixture({
          lessonPlan: {
            ...itemFixture().lessonPlan,
            term: { ...itemFixture().lessonPlan.term, isActive: false },
          },
        }),
      }).statusUseCase.execute('item-1', {
        status: TeacherLessonPreparationStatusDto.IN_PROGRESS,
      }),
    ).rejects.toMatchObject({
      code: 'teacher_app.lesson_preparation.closed_term',
    });

    await expect(
      createUseCases({
        detailItem: itemFixture({
          lessonPlan: {
            ...itemFixture().lessonPlan,
            status: LessonPlanStatus.ARCHIVED,
          },
        }),
      }).statusUseCase.execute('item-1', {
        status: TeacherLessonPreparationStatusDto.IN_PROGRESS,
      }),
    ).rejects.toMatchObject({
      code: 'teacher_app.lesson_preparation.read_only',
    });
  });

  it('does not weaken dashboard lesson-plan item transition rules', async () => {
    const { statusUseCase } = createUseCases({
      detailItem: itemFixture({ status: LessonPlanItemStatus.DONE }),
    });

    await expect(
      statusUseCase.execute('item-1', {
        status: TeacherLessonPreparationStatusDto.IN_PROGRESS,
      }),
    ).rejects.toMatchObject({
      code: 'teacher_app.lesson_preparation.invalid_transition',
    });
  });
});

describe('TeacherLessonPreparationReadAdapter', () => {
  it('queries scoped Prisma for teacher-owned visible lesson-plan items', async () => {
    const findMany = jest.fn().mockResolvedValue([itemFixture()]);
    const adapter = new TeacherLessonPreparationReadAdapter({
      scoped: {
        lessonPlanItem: {
          findMany,
        },
      },
    } as never);

    await adapter.listItemsForTeacherOnDate({
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
      allocationIds: ['allocation-1'],
      date: utcDate('2026-09-14'),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: SCHOOL_ID,
          deletedAt: null,
          plannedDate: utcDate('2026-09-14'),
          lessonPlan: {
            is: expect.objectContaining({
              teacherUserId: TEACHER_ID,
              teacherSubjectAllocationId: { in: ['allocation-1'] },
              status: { not: LessonPlanStatus.ARCHIVED },
            }),
          },
        }),
      }),
    );
  });

  it('does not query when the teacher has no owned allocations', async () => {
    const findMany = jest.fn();
    const adapter = new TeacherLessonPreparationReadAdapter({
      scoped: {
        lessonPlanItem: {
          findMany,
        },
      },
    } as never);

    await expect(
      adapter.listItemsForTeacherOnDate({
        teacherUserId: TEACHER_ID,
        schoolId: SCHOOL_ID,
        allocationIds: [],
        date: utcDate('2026-09-14'),
      }),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('TeacherLessonPreparationPresenter', () => {
  it('hides tenant and internal soft-delete fields', () => {
    const result = TeacherLessonPreparationPresenter.presentItem(itemFixture());
    const json = JSON.stringify(result);

    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
    expect(json).not.toContain('membershipId');
    expect(json).not.toContain('roleId');
    expect(json).not.toContain('email');
    expect(json).not.toContain('deletedAt');
  });
});

function createUseCases(params?: {
  items?: TeacherLessonPreparationItemRecord[];
  detailItem?: TeacherLessonPreparationItemRecord | null;
  updatedItem?: TeacherLessonPreparationItemRecord;
}): {
  todayUseCase: GetTeacherLessonPreparationTodayUseCase;
  weekUseCase: GetTeacherLessonPreparationWeekUseCase;
  detailUseCase: GetTeacherLessonPreparationDetailUseCase;
  statusUseCase: UpdateTeacherLessonPreparationStatusUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  readAdapter: jest.Mocked<TeacherLessonPreparationReadAdapter>;
} {
  const items = params?.items ?? [itemFixture()];
  const detailItem =
    params && 'detailItem' in params ? params.detailItem : itemFixture();
  const updatedItem = params?.updatedItem ?? detailItem ?? itemFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    listOwnedTeacherAllocationIds: jest.fn(() =>
      Promise.resolve(['allocation-1']),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const readAdapter = {
    listItemsForTeacherOnDate: jest.fn(() => Promise.resolve(items)),
    listItemsForTeacherDateRange: jest.fn(() => Promise.resolve(items)),
    findOwnedItemById: jest.fn(() => Promise.resolve(detailItem)),
    updateItemStatus: jest.fn(() => Promise.resolve(updatedItem)),
  } as unknown as jest.Mocked<TeacherLessonPreparationReadAdapter>;

  return {
    todayUseCase: new GetTeacherLessonPreparationTodayUseCase(
      accessService,
      readAdapter,
    ),
    weekUseCase: new GetTeacherLessonPreparationWeekUseCase(
      accessService,
      readAdapter,
    ),
    detailUseCase: new GetTeacherLessonPreparationDetailUseCase(
      accessService,
      readAdapter,
    ),
    statusUseCase: new UpdateTeacherLessonPreparationStatusUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function itemFixture(
  overrides?: Partial<TeacherLessonPreparationItemRecord>,
): TeacherLessonPreparationItemRecord {
  const base: TeacherLessonPreparationItemRecord = {
    id: 'item-1',
    lessonPlanId: 'plan-1',
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    lessonId: 'lesson-1',
    timetableEntryId: 'entry-1',
    plannedDate: utcDate('2026-09-14'),
    dayOfWeek: 1,
    periodId: 'period-1',
    periodLabel: 'Period 1',
    title: 'Fractions warmup',
    notes: null,
    status: LessonPlanItemStatus.PLANNED,
    sortOrder: 1,
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    cancelledAt: null,
    createdAt: utcDate('2026-09-01'),
    updatedAt: utcDate('2026-09-01'),
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
      objectives: ['Objective 1'],
      sortOrder: 1,
      deletedAt: null,
      contentItems: [
        {
          id: 'content-1',
          type: LessonContentItemType.TEXT,
          title: 'Warmup',
          bodyText: 'Read pages 1-2',
          url: null,
          sortOrder: 1,
          isRequired: true,
          estimatedMinutes: 10,
          metadata: null,
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
          metadata: null,
          file: {
            id: 'file-1',
            originalName: 'worksheet.pdf',
            mimeType: 'application/pdf',
            sizeBytes: BigInt(1234),
            deletedAt: null,
          },
        },
      ],
    },
    lessonPlan: {
      id: 'plan-1',
      schoolId: SCHOOL_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
      teacherSubjectAllocationId: 'allocation-1',
      teacherUserId: TEACHER_ID,
      classroomId: 'classroom-1',
      subjectId: 'subject-1',
      curriculumId: 'curriculum-1',
      status: LessonPlanStatus.ACTIVE,
      deletedAt: null,
      term: {
        id: 'term-1',
        schoolId: SCHOOL_ID,
        academicYearId: 'year-1',
        startDate: utcDate('2026-09-01'),
        endDate: utcDate('2026-12-31'),
        isActive: true,
        deletedAt: null,
      },
      teacherSubjectAllocation: {
        id: 'allocation-1',
        schoolId: SCHOOL_ID,
        teacherUserId: TEACHER_ID,
        subjectId: 'subject-1',
        classroomId: 'classroom-1',
        termId: 'term-1',
      },
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
        nameEn: 'Classroom 1',
        deletedAt: null,
      },
    },
    timetableEntry: {
      id: 'entry-1',
      termId: 'term-1',
      teacherSubjectAllocationId: 'allocation-1',
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
  };

  return {
    ...base,
    ...overrides,
  };
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
