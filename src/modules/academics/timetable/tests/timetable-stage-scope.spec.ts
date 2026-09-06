import { TimetableScopeType, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { resolveTimetableScope } from '../application/timetable-use-case.helpers';
import { classroomMatchesTimetableConfigScope } from '../domain/timetable-policy';
import { TimetableRepository } from '../infrastructure/timetable.repository';

describe('Timetable stage scope', () => {
  const hierarchy = {
    stage: { id: 'stage-1', schoolId: 'school-1' },
    grade: {
      id: 'grade-1',
      schoolId: 'school-1',
      stageId: 'stage-1',
      nameAr: 'Grade 1',
      nameEn: 'Grade 1',
    },
    section: {
      id: 'section-1',
      schoolId: 'school-1',
      gradeId: 'grade-1',
      grade: { id: 'grade-1', stageId: 'stage-1' },
    },
    classroom: {
      id: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      nameAr: 'Classroom 1',
      nameEn: 'Classroom 1',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
        grade: { id: 'grade-1', stageId: 'stage-1' },
      },
    },
  };

  async function withScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'organization-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [],
      });
      return testFn();
    });
  }

  function createRepository(): TimetableRepository {
    return {
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
      findStageById: jest
        .fn()
        .mockImplementation((id: string) =>
          id === hierarchy.stage.id ? hierarchy.stage : null,
        ),
      findGradeById: jest
        .fn()
        .mockImplementation((id: string) =>
          id === hierarchy.grade.id ? hierarchy.grade : null,
        ),
      findSectionById: jest
        .fn()
        .mockImplementation((id: string) =>
          id === hierarchy.section.id ? hierarchy.section : null,
        ),
      findClassroomById: jest
        .fn()
        .mockImplementation((id: string) =>
          id === hierarchy.classroom.id ? hierarchy.classroom : null,
        ),
    } as unknown as TimetableRepository;
  }

  it('resolves TERM and STAGE to canonical fields and stable keys', async () => {
    await withScope(async () => {
      const repository = createRepository();
      await expect(
        resolveTimetableScope(repository, {
          academicYearId: 'year-1',
          termId: 'term-1',
          scopeType: TimetableScopeType.TERM,
          stageId: 'ignored-stage',
          gradeId: 'ignored-grade',
        }),
      ).resolves.toMatchObject({
        scopeKey: 'term:term-1',
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      });

      await expect(
        resolveTimetableScope(repository, {
          academicYearId: 'year-1',
          termId: 'term-1',
          scopeType: TimetableScopeType.STAGE,
          stageId: 'stage-1',
          gradeId: 'ignored-grade',
        }),
      ).resolves.toMatchObject({
        scopeKey: 'stage:stage-1',
        stageId: 'stage-1',
        gradeId: null,
        sectionId: null,
        classroomId: null,
      });
    });
  });

  it('requires a stage id and hides unavailable stages', async () => {
    await withScope(async () => {
      const repository = createRepository();
      await expect(
        resolveTimetableScope(repository, {
          academicYearId: 'year-1',
          termId: 'term-1',
          scopeType: TimetableScopeType.STAGE,
        }),
      ).rejects.toMatchObject({
        code: 'validation.failed',
        details: { field: 'stageId' },
      });

      await expect(
        resolveTimetableScope(repository, {
          academicYearId: 'year-1',
          termId: 'term-1',
          scopeType: TimetableScopeType.STAGE,
          stageId: 'foreign-stage',
        }),
      ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    });
  });

  it.each([
    {
      label: 'grade',
      input: {
        scopeType: TimetableScopeType.GRADE,
        gradeId: 'grade-1',
      },
      expected: {
        scopeKey: 'grade:grade-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: null,
        classroomId: null,
      },
    },
    {
      label: 'section',
      input: {
        scopeType: TimetableScopeType.SECTION,
        sectionId: 'section-1',
      },
      expected: {
        scopeKey: 'section:section-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: null,
      },
    },
    {
      label: 'classroom',
      input: {
        scopeType: TimetableScopeType.CLASSROOM,
        classroomId: 'classroom-1',
      },
      expected: {
        scopeKey: 'classroom:classroom-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    },
  ])(
    'derives canonical stage ancestry for $label scope',
    async ({ input, expected }) => {
      await withScope(async () => {
        await expect(
          resolveTimetableScope(createRepository(), {
            academicYearId: 'year-1',
            termId: 'term-1',
            ...input,
          }),
        ).resolves.toMatchObject(expected);
      });
    },
  );

  it.each([
    {
      scopeType: TimetableScopeType.GRADE,
      gradeId: 'grade-1',
      stageId: 'stage-2',
    },
    {
      scopeType: TimetableScopeType.SECTION,
      sectionId: 'section-1',
      gradeId: 'grade-2',
    },
    {
      scopeType: TimetableScopeType.SECTION,
      sectionId: 'section-1',
      stageId: 'stage-2',
    },
    {
      scopeType: TimetableScopeType.CLASSROOM,
      classroomId: 'classroom-1',
      sectionId: 'section-2',
    },
    {
      scopeType: TimetableScopeType.CLASSROOM,
      classroomId: 'classroom-1',
      gradeId: 'grade-2',
    },
    {
      scopeType: TimetableScopeType.CLASSROOM,
      classroomId: 'classroom-1',
      stageId: 'stage-2',
    },
  ])(
    'uses non-leaking not-found semantics for a mismatched ancestor',
    async (input) => {
      await withScope(async () => {
        await expect(
          resolveTimetableScope(createRepository(), {
            academicYearId: 'year-1',
            termId: 'term-1',
            ...input,
          }),
        ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
      });
    },
  );

  it('matches every scope independently and isolates stages', () => {
    const classroom = hierarchy.classroom;
    const config = {
      scopeType: TimetableScopeType.TERM,
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    };

    expect(classroomMatchesTimetableConfigScope(config, classroom)).toBe(true);
    expect(
      classroomMatchesTimetableConfigScope(
        { ...config, scopeType: TimetableScopeType.STAGE, stageId: 'stage-1' },
        classroom,
      ),
    ).toBe(true);
    expect(
      classroomMatchesTimetableConfigScope(
        { ...config, scopeType: TimetableScopeType.STAGE, stageId: 'stage-2' },
        classroom,
      ),
    ).toBe(false);
    expect(
      classroomMatchesTimetableConfigScope(
        { ...config, scopeType: TimetableScopeType.GRADE, gradeId: 'grade-1' },
        classroom,
      ),
    ).toBe(true);
    expect(
      classroomMatchesTimetableConfigScope(
        {
          ...config,
          scopeType: TimetableScopeType.SECTION,
          sectionId: 'section-1',
        },
        classroom,
      ),
    ).toBe(true);
    expect(
      classroomMatchesTimetableConfigScope(
        {
          ...config,
          scopeType: TimetableScopeType.CLASSROOM,
          classroomId: 'classroom-1',
        },
        classroom,
      ),
    ).toBe(true);
  });
});
