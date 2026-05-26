import {
  LessonPlanItemStatus,
  LessonPlanStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  CreateLessonPlanItemUseCase,
  CreateLessonPlanUseCase,
  ReorderLessonPlanItemUseCase,
  StartLessonPlanItemUseCase,
  UpdateLessonPlanUseCase,
} from '../application/lesson-plans.use-cases';
import {
  LessonPlanDetailRecord,
  LessonPlanItemRecord,
  LessonPlansRepository,
} from '../infrastructure/lesson-plans.repository';
import { presentLessonPlanDetail } from '../presenters/lesson-plans.presenter';

describe('Lesson plans use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'academics.lesson_plans.view',
          'academics.lesson_plans.manage',
        ],
      });

      await testFn();
    });
  }

  function createRepository(
    overrides: Partial<Record<keyof LessonPlansRepository, jest.Mock>> = {},
  ): LessonPlansRepository {
    const repo = {
      listPlans: jest.fn().mockResolvedValue([]),
      findPlanById: jest.fn().mockResolvedValue(planRecord()),
      findDuplicatePlan: jest.fn().mockResolvedValue(null),
      findAcademicYearById: jest.fn().mockResolvedValue({
        id: 'year-1',
        schoolId: 'school-1',
        isActive: true,
      }),
      findTermById: jest.fn().mockResolvedValue({
        id: 'term-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        isActive: true,
      }),
      findTeacherAllocationById: jest.fn().mockResolvedValue(allocationRecord()),
      findCurriculumById: jest.fn().mockResolvedValue(curriculumRecord()),
      findUnitById: jest.fn().mockResolvedValue({
        id: 'unit-1',
        curriculumId: 'curriculum-1',
        title: 'Unit 1',
      }),
      findLessonById: jest.fn().mockResolvedValue({
        id: 'lesson-1',
        curriculumId: 'curriculum-1',
        unitId: 'unit-1',
        title: 'Lesson 1',
      }),
      findTimetableEntryById: jest.fn().mockResolvedValue(timetableRecord()),
      createPlan: jest.fn().mockImplementation(async (data) =>
        planRecord({
          ...data,
          id: 'plan-created',
          items: [],
        }),
      ),
      updatePlan: jest.fn().mockImplementation(async (id, data) =>
        planRecord({
          id,
          ...data,
        }),
      ),
      softDeletePlan: jest.fn(),
      getNextItemSortOrder: jest.fn().mockResolvedValue(3),
      findItemById: jest.fn().mockResolvedValue(itemRecord()),
      createItem: jest.fn().mockImplementation(async (data) =>
        itemRecord({
          ...data,
          id: 'item-created',
          unit: { id: data.unitId, title: 'Unit 1' },
          lesson: { id: data.lessonId, title: 'Lesson 1' },
        }),
      ),
      updateItem: jest.fn().mockImplementation(async (id, data) =>
        itemRecord({
          id,
          ...data,
        }),
      ),
      softDeleteItem: jest.fn(),
      listItemsForPlan: jest.fn().mockResolvedValue([]),
      countNonDeletedItems: jest.fn().mockResolvedValue(1),
      updateManyItemsStatus: jest.fn(),
      ...overrides,
    };

    return repo as unknown as LessonPlansRepository;
  }

  function createAuthRepository() {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('creates a lesson plan after validating academic scope', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonPlanUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          teacherSubjectAllocationId: 'allocation-1',
          curriculumId: 'curriculum-1',
          title: '  Week Plan  ',
          weekStartDate: '2026-09-07',
          weekEndDate: '2026-09-11',
        }),
      ).resolves.toMatchObject({
        lessonPlanId: 'plan-created',
        title: 'Week Plan',
        status: 'draft',
        teacherUserId: 'teacher-1',
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
      });
    });

    expect(repository.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        teacherUserId: 'teacher-1',
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
        status: LessonPlanStatus.DRAFT,
      }),
    );
  });

  it('rejects duplicate plans for the same allocation and week', async () => {
    const repository = createRepository({
      findDuplicatePlan: jest.fn().mockResolvedValue({ id: 'existing-plan' }),
    });
    const useCase = new CreateLessonPlanUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          teacherSubjectAllocationId: 'allocation-1',
          curriculumId: 'curriculum-1',
          title: 'Week Plan',
          weekStartDate: '2026-09-07',
          weekEndDate: '2026-09-11',
        }),
      ).rejects.toMatchObject({ code: 'academics.lesson_plan.duplicate' });
    });
  });

  it('rejects curriculum that does not match allocation grade, subject, or term', async () => {
    const repository = createRepository({
      findCurriculumById: jest.fn().mockResolvedValue(
        curriculumRecord({
          termId: 'term-2',
          subjectId: 'subject-2',
        }),
      ),
    });
    const useCase = new CreateLessonPlanUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          teacherSubjectAllocationId: 'allocation-1',
          curriculumId: 'curriculum-1',
          title: 'Mismatched',
          weekStartDate: '2026-09-07',
          weekEndDate: '2026-09-11',
        }),
      ).rejects.toMatchObject({ code: 'academics.lesson_plan.invalid_scope' });
    });
  });

  it('prevents mutation when lesson plan is archived', async () => {
    const repository = createRepository({
      findPlanById: jest.fn().mockResolvedValue(
        planRecord({
          status: LessonPlanStatus.ARCHIVED,
        }),
      ),
    });
    const useCase = new UpdateLessonPlanUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute('plan-1', { title: 'Nope' }),
      ).rejects.toMatchObject({ code: 'academics.lesson_plan.read_only' });
    });
  });

  it('creates an item after validating curriculum unit and lesson containment', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonPlanItemUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute('plan-1', {
          unitId: 'unit-1',
          lessonId: 'lesson-1',
          plannedDate: '2026-09-08',
        }),
      ).resolves.toMatchObject({
        itemId: 'item-created',
        curriculumId: 'curriculum-1',
        unitId: 'unit-1',
        lessonId: 'lesson-1',
        title: 'Lesson 1',
        dayOfWeek: 2,
        sortOrder: 3,
      });
    });

    expect(repository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonPlanId: 'plan-1',
        curriculumId: 'curriculum-1',
        status: LessonPlanItemStatus.PLANNED,
      }),
    );
  });

  it('rejects an item for an unrelated lesson', async () => {
    const repository = createRepository({
      findLessonById: jest.fn().mockResolvedValue({
        id: 'lesson-2',
        curriculumId: 'other-curriculum',
        unitId: 'unit-1',
        title: 'Other Lesson',
      }),
    });
    const useCase = new CreateLessonPlanItemUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute('plan-1', {
          unitId: 'unit-1',
          lessonId: 'lesson-2',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_plan.invalid_item_scope',
      });
    });
  });

  it('rejects a timetable entry outside the plan scope', async () => {
    const repository = createRepository({
      findTimetableEntryById: jest.fn().mockResolvedValue(
        timetableRecord({
          classroomId: 'classroom-2',
        }),
      ),
    });
    const useCase = new CreateLessonPlanItemUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute('plan-1', {
          unitId: 'unit-1',
          lessonId: 'lesson-1',
          timetableEntryId: 'entry-1',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_plan.invalid_item_scope',
      });
    });
  });

  it('reorders items inside the same lesson plan', async () => {
    const repository = createRepository();
    const useCase = new ReorderLessonPlanItemUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute('plan-1', 'item-1', { sortOrder: 0 }),
      ).resolves.toMatchObject({
        itemId: 'item-1',
        sortOrder: 0,
      });
    });

    expect(repository.findItemById).toHaveBeenCalledWith({
      lessonPlanId: 'plan-1',
      itemId: 'item-1',
    });
    expect(repository.updateItem).toHaveBeenCalledWith('item-1', {
      sortOrder: 0,
      updatedByUserId: 'user-1',
    });
  });

  it('applies valid status transitions and rejects invalid transitions', async () => {
    const repository = createRepository();
    const startUseCase = new StartLessonPlanItemUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        startUseCase.execute('plan-1', 'item-1'),
      ).resolves.toMatchObject({
        itemId: 'item-1',
        status: 'in_progress',
      });
    });

    const invalidRepository = createRepository({
      findItemById: jest.fn().mockResolvedValue(
        itemRecord({
          status: LessonPlanItemStatus.DONE,
        }),
      ),
    });
    const invalidUseCase = new StartLessonPlanItemUseCase(
      invalidRepository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        invalidUseCase.execute('plan-1', 'item-1'),
      ).rejects.toMatchObject({
        code: 'academics.lesson_plan.item_invalid_transition',
      });
    });
  });

  it('presenter hides tenant fields', () => {
    const result = presentLessonPlanDetail(
      planRecord({
        items: [itemRecord()],
      }),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      lessonPlanId: 'plan-1',
      teacher: { id: 'teacher-1' },
      items: [{ itemId: 'item-1' }],
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  });
});

function allocationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    teacherUser: {
      id: 'teacher-1',
      firstName: 'Tina',
      lastName: 'Teacher',
      email: 'teacher@example.test',
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Class AR',
      nameEn: 'Class EN',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
      },
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
      color: null,
    },
    term: {
      id: 'term-1',
      academicYearId: 'year-1',
    },
    ...overrides,
  };
}

function curriculumRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'curriculum-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    subjectId: 'subject-1',
    title: 'Math Curriculum',
    status: 'DRAFT',
    ...overrides,
  };
}

function planRecord(
  overrides: Partial<LessonPlanDetailRecord> = {},
): LessonPlanDetailRecord {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'plan-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    teacherSubjectAllocationId: 'allocation-1',
    teacherUserId: 'teacher-1',
    classroomId: 'classroom-1',
    subjectId: 'subject-1',
    curriculumId: 'curriculum-1',
    title: 'Week Plan',
    description: null,
    status: LessonPlanStatus.DRAFT,
    weekStartDate: new Date('2026-09-07T00:00:00.000Z'),
    weekEndDate: new Date('2026-09-11T00:00:00.000Z'),
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    activatedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    academicYear: {
      id: 'year-1',
      nameAr: 'Year AR',
      nameEn: 'Year EN',
    },
    term: {
      id: 'term-1',
      nameAr: 'Term AR',
      nameEn: 'Term EN',
    },
    teacherUser: {
      id: 'teacher-1',
      firstName: 'Tina',
      lastName: 'Teacher',
      email: 'teacher@example.test',
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Class AR',
      nameEn: 'Class EN',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
      },
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
      color: null,
    },
    curriculum: {
      id: 'curriculum-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      gradeId: 'grade-1',
      subjectId: 'subject-1',
      title: 'Math Curriculum',
      status: 'DRAFT',
    },
    items: [],
    ...overrides,
  } as LessonPlanDetailRecord;
}

function itemRecord(
  overrides: Partial<LessonPlanItemRecord> = {},
): LessonPlanItemRecord {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'item-1',
    schoolId: 'school-1',
    lessonPlanId: 'plan-1',
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    lessonId: 'lesson-1',
    timetableEntryId: null,
    plannedDate: new Date('2026-09-08T00:00:00.000Z'),
    dayOfWeek: 2,
    periodId: null,
    periodLabel: null,
    title: 'Lesson 1',
    notes: null,
    status: LessonPlanItemStatus.PLANNED,
    sortOrder: 1,
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    cancelledAt: null,
    rescheduledFromItemId: null,
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    unit: {
      id: 'unit-1',
      title: 'Unit 1',
    },
    lesson: {
      id: 'lesson-1',
      title: 'Lesson 1',
    },
    ...overrides,
  } as LessonPlanItemRecord;
}

function timetableRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    teacherSubjectAllocationId: 'allocation-1',
    teacherUserId: 'teacher-1',
    classroomId: 'classroom-1',
    subjectId: 'subject-1',
    periodId: 'period-1',
    dayOfWeek: 2,
    status: 'ACTIVE',
    period: {
      id: 'period-1',
      label: 'Period 1',
    },
    ...overrides,
  };
}
