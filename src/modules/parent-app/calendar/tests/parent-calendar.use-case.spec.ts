import { ParentAppClassroomNotFoundException } from '../../shared/parent-app-errors';
import { ListParentCalendarEventsUseCase } from '../application/list-parent-calendar-events.use-case';

describe('ListParentCalendarEventsUseCase', () => {
  it('requires owned child access and derives child calendar visibility', async () => {
    const query = { limit: 10 };
    const accessibleChild = {
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    };
    const classroomScope = {
      classroomId: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      gradeId: 'grade-1',
      stageId: 'stage-1',
    };
    const visibility = {
      actorKind: 'parent' as const,
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      visibleStageIds: ['stage-1'],
      visibleGradeIds: ['grade-1'],
      visibleSectionIds: ['section-1'],
    };
    const accessService = {
      getAccessibleChild: jest.fn().mockResolvedValue(accessibleChild),
      assertCurrentParent: jest.fn().mockResolvedValue({
        schoolId: 'school-1',
      }),
    };
    const visibilityService = {
      findClassroomScope: jest.fn().mockResolvedValue(classroomScope),
      buildParentVisibilityContext: jest.fn().mockReturnValue(visibility),
    };
    const listUseCase = {
      execute: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };

    const useCase = new ListParentCalendarEventsUseCase(
      accessService as never,
      visibilityService as never,
      listUseCase as never,
    );

    await expect(
      useCase.execute({ studentId: 'student-1', query }),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(accessService.getAccessibleChild).toHaveBeenCalledWith('student-1');
    expect(visibilityService.findClassroomScope).toHaveBeenCalledWith(
      'classroom-1',
    );
    expect(visibilityService.buildParentVisibilityContext).toHaveBeenCalledWith(
      {
        schoolId: 'school-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomScope,
      },
    );
    expect(listUseCase.execute).toHaveBeenCalledWith({ visibility, query });
  });

  it('rejects missing child enrollment classroom structure', async () => {
    const useCase = new ListParentCalendarEventsUseCase(
      {
        getAccessibleChild: jest.fn().mockResolvedValue({
          studentId: 'student-1',
          classroomId: 'classroom-missing',
          academicYearId: 'year-1',
          termId: 'term-1',
        }),
        assertCurrentParent: jest.fn().mockResolvedValue({
          schoolId: 'school-1',
        }),
      } as never,
      {
        findClassroomScope: jest.fn().mockResolvedValue(null),
      } as never,
      {} as never,
    );

    await expect(
      useCase.execute({ studentId: 'student-1', query: {} }),
    ).rejects.toBeInstanceOf(ParentAppClassroomNotFoundException);
  });
});
