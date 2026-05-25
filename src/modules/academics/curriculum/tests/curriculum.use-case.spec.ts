import { CurriculumStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  ActivateCurriculumUseCase,
  CreateCurriculumLessonUseCase,
  CreateCurriculumUnitUseCase,
  CreateCurriculumUseCase,
  ReorderCurriculumLessonUseCase,
  ReorderCurriculumUnitUseCase,
  UpdateCurriculumLessonUseCase,
  UpdateCurriculumUnitUseCase,
  UpdateCurriculumUseCase,
} from '../application/curriculum.use-cases';
import {
  CurriculumDetailRecord,
  CurriculumLessonRecord,
  CurriculumRepository,
  CurriculumUnitRecord,
} from '../infrastructure/curriculum.repository';
import { presentCurriculumDetail } from '../presenters/curriculum.presenter';

describe('Curriculum use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'academics.curriculum.view',
          'academics.curriculum.manage',
        ],
      });

      await testFn();
    });
  }

  function createRepository(
    overrides: Partial<Record<keyof CurriculumRepository, jest.Mock>> = {},
  ): CurriculumRepository {
    const repo = {
      findAcademicYearById: jest.fn().mockResolvedValue({
        id: 'year-1',
        schoolId: 'school-1',
        nameAr: 'Year',
        nameEn: 'Year',
      }),
      findTermById: jest.fn().mockResolvedValue({
        id: 'term-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        nameAr: 'Term',
        nameEn: 'Term',
      }),
      findGradeById: jest.fn().mockResolvedValue({
        id: 'grade-1',
        schoolId: 'school-1',
        nameAr: 'Grade',
        nameEn: 'Grade',
      }),
      findSubjectById: jest.fn().mockResolvedValue({
        id: 'subject-1',
        schoolId: 'school-1',
        nameAr: 'Math',
        nameEn: 'Math',
        code: 'MATH',
        color: '#334455',
        isActive: true,
      }),
      listCurricula: jest.fn().mockResolvedValue([]),
      findCurriculumById: jest.fn().mockResolvedValue(curriculum()),
      findCurriculumByScope: jest.fn().mockResolvedValue(null),
      createCurriculum: jest.fn().mockImplementation(async (data) =>
        curriculum({
          ...data,
          id: 'curriculum-created',
          units: [],
          lessons: [],
        }),
      ),
      updateCurriculum: jest.fn().mockImplementation(async (id, data) =>
        curriculum({
          id,
          ...data,
        }),
      ),
      countActiveUnitsAndLessons: jest
        .fn()
        .mockResolvedValue({ unitsCount: 1, lessonsCount: 1 }),
      softDeleteCurriculum: jest.fn().mockResolvedValue({
        status: 'deleted',
        curriculum: curriculum({ deletedAt: new Date('2026-05-25T12:00:00Z') }),
      }),
      findUnitById: jest.fn().mockResolvedValue(unit()),
      getNextUnitSortOrder: jest.fn().mockResolvedValue(1),
      createUnit: jest.fn().mockImplementation(async (data) =>
        unit({
          ...data,
          id: 'unit-created',
          lessons: [],
        }),
      ),
      updateUnit: jest.fn().mockImplementation(async (id, data) =>
        unit({
          id,
          ...data,
        }),
      ),
      softDeleteUnit: jest.fn().mockResolvedValue({
        status: 'deleted',
        unit: unit({ deletedAt: new Date('2026-05-25T12:00:00Z') }),
      }),
      findLessonById: jest.fn().mockResolvedValue(lesson()),
      getNextLessonSortOrder: jest.fn().mockResolvedValue(1),
      createLesson: jest.fn().mockImplementation(async (data) =>
        lesson({
          ...data,
          id: 'lesson-created',
        }),
      ),
      updateLesson: jest.fn().mockImplementation(async (id, data) =>
        lesson({
          id,
          ...data,
        }),
      ),
      softDeleteLesson: jest.fn().mockResolvedValue({
        status: 'deleted',
        lesson: lesson({ deletedAt: new Date('2026-05-25T12:00:00Z') }),
      }),
      ...overrides,
    };

    return repo as unknown as CurriculumRepository;
  }

  function createAuthRepository() {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('validates academic scope before creating curriculum', async () => {
    const repository = createRepository({
      findTermById: jest.fn().mockResolvedValue({
        id: 'term-1',
        schoolId: 'school-1',
        academicYearId: 'year-2',
        nameAr: 'Term',
        nameEn: 'Term',
      }),
    });
    const auth = createAuthRepository();
    const useCase = new CreateCurriculumUseCase(repository, auth as never);

    await withScope(async () => {
      await expect(
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          gradeId: 'grade-1',
          subjectId: 'subject-1',
          title: '  Mathematics Plan  ',
        }),
      ).rejects.toMatchObject({
        code: 'academics.curriculum.invalid_scope',
      });
    });

    expect(repository.createCurriculum).not.toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects duplicate non-deleted curriculum for the same academic scope', async () => {
    const repository = createRepository({
      findCurriculumByScope: jest.fn().mockResolvedValue(curriculum()),
    });
    const useCase = new CreateCurriculumUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          gradeId: 'grade-1',
          subjectId: 'subject-1',
          title: 'Mathematics Plan',
        }),
      ).rejects.toMatchObject({
        code: 'academics.curriculum.duplicate',
      });
    });
  });

  it('does not mutate archived curriculum', async () => {
    const repository = createRepository({
      findCurriculumById: jest
        .fn()
        .mockResolvedValue(curriculum({ status: CurriculumStatus.ARCHIVED })),
    });
    const useCase = new UpdateCurriculumUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute('curriculum-1', { title: 'Updated' }),
      ).rejects.toMatchObject({
        code: 'academics.curriculum.read_only',
      });
    });

    expect(repository.updateCurriculum).not.toHaveBeenCalled();
  });

  it('creates, updates, and reorders units deterministically', async () => {
    const repository = createRepository();
    const auth = createAuthRepository();
    const create = new CreateCurriculumUnitUseCase(repository, auth as never);
    const update = new UpdateCurriculumUnitUseCase(repository, auth as never);
    const reorder = new ReorderCurriculumUnitUseCase(repository, auth as never);

    await withScope(async () => {
      await expect(
        create.execute('curriculum-1', {
          title: ' Unit One ',
          estimatedLessons: 4,
        }),
      ).resolves.toMatchObject({
        unitId: 'unit-created',
        title: 'Unit One',
        sortOrder: 1,
        estimatedLessons: 4,
      });

      await expect(
        update.execute('curriculum-1', 'unit-1', {
          title: 'Updated Unit',
          estimatedLessons: null,
        }),
      ).resolves.toMatchObject({
        unitId: 'unit-1',
        title: 'Updated Unit',
        estimatedLessons: null,
      });

      await expect(
        reorder.execute('curriculum-1', 'unit-1', { sortOrder: 7 }),
      ).resolves.toMatchObject({
        unitId: 'unit-1',
        sortOrder: 7,
      });
    });
  });

  it('creates, updates, and reorders lessons within one unit', async () => {
    const repository = createRepository();
    const auth = createAuthRepository();
    const create = new CreateCurriculumLessonUseCase(repository, auth as never);
    const update = new UpdateCurriculumLessonUseCase(repository, auth as never);
    const reorder = new ReorderCurriculumLessonUseCase(
      repository,
      auth as never,
    );

    await withScope(async () => {
      await expect(
        create.execute('curriculum-1', 'unit-1', {
          title: ' Fractions ',
          objectives: [' Understand thirds ', 'Compare fractions'],
          estimatedMinutes: 45,
        }),
      ).resolves.toMatchObject({
        lessonId: 'lesson-created',
        title: 'Fractions',
        objectives: ['Understand thirds', 'Compare fractions'],
        sortOrder: 1,
      });

      await expect(
        update.execute('curriculum-1', 'unit-1', 'lesson-1', {
          title: 'Updated Lesson',
          objectives: null,
        }),
      ).resolves.toMatchObject({
        lessonId: 'lesson-1',
        title: 'Updated Lesson',
        objectives: [],
      });

      await expect(
        reorder.execute('curriculum-1', 'unit-1', 'lesson-1', {
          sortOrder: 5,
        }),
      ).resolves.toMatchObject({
        lessonId: 'lesson-1',
        sortOrder: 5,
      });
    });
  });

  it('requires at least one unit and one lesson before activation', async () => {
    const repository = createRepository({
      countActiveUnitsAndLessons: jest
        .fn()
        .mockResolvedValue({ unitsCount: 1, lessonsCount: 0 }),
    });
    const activate = new ActivateCurriculumUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(activate.execute('curriculum-1')).rejects.toMatchObject({
        code: 'academics.curriculum.activation_incomplete',
      });
    });
  });

  it('presenters hide tenant fields', () => {
    const result = presentCurriculumDetail(
      curriculum({
        units: [unit({ lessons: [lesson()] })],
        lessons: [lesson()],
      }),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      curriculumId: 'curriculum-1',
      unitCount: 1,
      lessonCount: 1,
      units: [
        expect.objectContaining({
          unitId: 'unit-1',
          lessons: [expect.objectContaining({ lessonId: 'lesson-1' })],
        }),
      ],
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  });
});

function curriculum(
  overrides: Partial<CurriculumDetailRecord> = {},
): CurriculumDetailRecord {
  const now = new Date('2026-05-25T10:00:00.000Z');
  const units = (overrides.units as CurriculumUnitRecord[] | undefined) ?? [];
  const lessons =
    (overrides.lessons as Array<{ id: string }> | undefined) ?? [];

  return {
    id: 'curriculum-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    subjectId: 'subject-1',
    title: 'Mathematics Plan',
    description: null,
    status: CurriculumStatus.DRAFT,
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    publishedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    academicYear: {
      id: 'year-1',
      nameAr: 'Year',
      nameEn: 'Year',
    },
    term: {
      id: 'term-1',
      nameAr: 'Term',
      nameEn: 'Term',
    },
    grade: {
      id: 'grade-1',
      nameAr: 'Grade',
      nameEn: 'Grade',
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Math',
      nameEn: 'Math',
      code: 'MATH',
      color: '#334455',
    },
    units,
    lessons,
    ...overrides,
  } as CurriculumDetailRecord;
}

function unit(
  overrides: Partial<CurriculumUnitRecord> = {},
): CurriculumUnitRecord {
  const now = new Date('2026-05-25T10:00:00.000Z');

  return {
    id: 'unit-1',
    schoolId: 'school-1',
    curriculumId: 'curriculum-1',
    title: 'Unit One',
    description: null,
    sortOrder: 0,
    estimatedLessons: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    lessons: [],
    ...overrides,
  } as CurriculumUnitRecord;
}

function lesson(
  overrides: Partial<CurriculumLessonRecord> = {},
): CurriculumLessonRecord {
  const now = new Date('2026-05-25T10:00:00.000Z');

  return {
    id: 'lesson-1',
    schoolId: 'school-1',
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    title: 'Lesson One',
    description: null,
    objectives: ['Understand the concept'],
    sortOrder: 0,
    estimatedMinutes: 40,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as CurriculumLessonRecord;
}
