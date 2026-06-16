import { StudentAppClassroomNotFoundException } from '../../shared/student-app-errors';
import { ListStudentCalendarEventsUseCase } from '../application/list-student-calendar-events.use-case';

describe('ListStudentCalendarEventsUseCase', () => {
  it('derives student calendar visibility from current enrollment structure', async () => {
    const query = { limit: 10 };
    const classroomScope = {
      classroomId: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      gradeId: 'grade-1',
      stageId: 'stage-1',
    };
    const visibility = {
      actorKind: 'student' as const,
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      visibleStageIds: ['stage-1'],
      visibleGradeIds: ['grade-1'],
      visibleSectionIds: ['section-1'],
    };
    const accessService = {
      getCurrentStudentWithEnrollment: jest.fn().mockResolvedValue({
        context: {
          schoolId: 'school-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
        },
      }),
    };
    const visibilityService = {
      findClassroomScope: jest.fn().mockResolvedValue(classroomScope),
      buildStudentVisibilityContext: jest.fn().mockReturnValue(visibility),
    };
    const listUseCase = {
      execute: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };

    const useCase = new ListStudentCalendarEventsUseCase(
      accessService as never,
      visibilityService as never,
      listUseCase as never,
    );

    await expect(useCase.execute(query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(visibilityService.findClassroomScope).toHaveBeenCalledWith(
      'classroom-1',
    );
    expect(visibilityService.buildStudentVisibilityContext).toHaveBeenCalledWith(
      {
        schoolId: 'school-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomScope,
      },
    );
    expect(listUseCase.execute).toHaveBeenCalledWith({ visibility, query });
  });

  it('rejects missing enrollment classroom structure', async () => {
    const useCase = new ListStudentCalendarEventsUseCase(
      {
        getCurrentStudentWithEnrollment: jest.fn().mockResolvedValue({
          context: {
            schoolId: 'school-1',
            academicYearId: 'year-1',
            termId: 'term-1',
            classroomId: 'classroom-missing',
          },
        }),
      } as never,
      {
        findClassroomScope: jest.fn().mockResolvedValue(null),
      } as never,
      {} as never,
    );

    await expect(useCase.execute({})).rejects.toBeInstanceOf(
      StudentAppClassroomNotFoundException,
    );
  });
});
