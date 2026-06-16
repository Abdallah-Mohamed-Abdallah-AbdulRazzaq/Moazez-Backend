import { ListTeacherCalendarEventsUseCase } from '../application/list-teacher-calendar-events.use-case';

describe('ListTeacherCalendarEventsUseCase', () => {
  it('derives teacher calendar visibility from owned allocations', async () => {
    const query = { limit: 10 };
    const allocations = [{ id: 'allocation-1' }];
    const visibility = {
      actorKind: 'teacher' as const,
      schoolId: 'school-1',
      visibleStageIds: ['stage-1'],
      visibleGradeIds: ['grade-1'],
      visibleSectionIds: ['section-1'],
    };
    const accessService = {
      assertCurrentTeacher: jest.fn().mockReturnValue({
        schoolId: 'school-1',
        teacherUserId: 'teacher-1',
      }),
      listOwnedTeacherAllocations: jest.fn().mockResolvedValue(allocations),
    };
    const visibilityService = {
      buildTeacherVisibilityContext: jest.fn().mockReturnValue(visibility),
    };
    const listUseCase = {
      execute: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };

    const useCase = new ListTeacherCalendarEventsUseCase(
      accessService as never,
      visibilityService as never,
      listUseCase as never,
    );

    await expect(useCase.execute(query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(accessService.assertCurrentTeacher).toHaveBeenCalled();
    expect(accessService.listOwnedTeacherAllocations).toHaveBeenCalled();
    expect(visibilityService.buildTeacherVisibilityContext).toHaveBeenCalledWith(
      {
        schoolId: 'school-1',
        allocations,
      },
    );
    expect(listUseCase.execute).toHaveBeenCalledWith({ visibility, query });
  });
});
