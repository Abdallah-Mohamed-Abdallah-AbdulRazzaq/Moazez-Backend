import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
} from '@prisma/client';
import { AppCalendarEventsRepository } from '../infrastructure/app-calendar-events.repository';
import type { AppCalendarVisibilityContext } from '../visibility/app-calendar-visibility.types';

describe('AppCalendarEventsRepository', () => {
  const teacherVisibility: AppCalendarVisibilityContext = {
    actorKind: 'teacher',
    schoolId: 'school-1',
    visibleStageIds: ['stage-1'],
    visibleGradeIds: ['grade-1'],
    visibleSectionIds: ['section-1'],
  };

  const studentVisibility: AppCalendarVisibilityContext = {
    actorKind: 'student',
    schoolId: 'school-1',
    academicYearId: 'year-current',
    termId: 'term-current',
    visibleStageIds: ['stage-1'],
    visibleGradeIds: ['grade-1'],
    visibleSectionIds: ['section-1'],
  };

  it('uses the same visibility filter and actor academic context for detail access', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AppCalendarEventsRepository({
      scoped: {
        academicCalendarEvent: {
          findMany,
          findFirst,
        },
      },
    } as never);

    await repository.listVisibleEvents({
      visibility: studentVisibility,
      academicYearId: 'year-current',
      termId: 'term-current',
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T00:00:00.000Z'),
      type: AcademicCalendarEventType.EXAM,
      scopeType: AcademicCalendarEventScopeType.SECTION,
      limit: 51,
    });
    await repository.findVisibleEventById('event-1', studentVisibility);

    const listWhere = findMany.mock.calls[0][0].where;
    const detailWhere = findFirst.mock.calls[0][0].where;

    expect(listWhere.schoolId).toBe('school-1');
    expect(detailWhere.schoolId).toBe('school-1');
    expect(listWhere.OR).toEqual(detailWhere.OR);
    expect(detailWhere.id).toBe('event-1');
    expect(detailWhere.academicYearId).toBe('year-current');
    expect(detailWhere.termId).toBe('term-current');
  });

  it('does not add academic filters for teacher visibility without academic context', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AppCalendarEventsRepository({
      scoped: {
        academicCalendarEvent: {
          findFirst,
        },
      },
    } as never);

    await repository.findVisibleEventById('event-1', teacherVisibility);

    const detailWhere = findFirst.mock.calls[0][0].where;

    expect(detailWhere.id).toBe('event-1');
    expect(detailWhere.schoolId).toBe('school-1');
    expect(detailWhere.OR).toEqual([
      { scopeType: AcademicCalendarEventScopeType.SCHOOL },
      {
        scopeType: AcademicCalendarEventScopeType.STAGE,
        stageId: { in: ['stage-1'] },
      },
      {
        scopeType: AcademicCalendarEventScopeType.GRADE,
        gradeId: { in: ['grade-1'] },
      },
      {
        scopeType: AcademicCalendarEventScopeType.SECTION,
        sectionId: { in: ['section-1'] },
      },
    ]);
    expect(detailWhere).not.toHaveProperty('academicYearId');
    expect(detailWhere).not.toHaveProperty('termId');
  });
});
