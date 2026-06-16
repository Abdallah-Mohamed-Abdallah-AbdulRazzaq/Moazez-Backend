import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
} from '@prisma/client';
import { presentAppCalendarEvent } from '../presenters/app-calendar-event.presenter';
import type { AppCalendarEventRecord } from '../infrastructure/app-calendar-events.repository';

describe('AppCalendarEventPresenter', () => {
  it('maps Prisma enums to lowercase app response values and hides internals', () => {
    const event: AppCalendarEventRecord = {
      id: 'event-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      title: 'Midterm',
      description: null,
      notes: 'dashboard-only note',
      type: AcademicCalendarEventType.EXAM,
      scopeType: AcademicCalendarEventScopeType.GRADE,
      scopeKey: 'grade-1',
      stageId: null,
      gradeId: 'grade-1',
      sectionId: null,
      allDay: true,
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-06-01T23:59:59.000Z'),
      createdByUserId: 'creator-1',
      updatedByUserId: 'updater-1',
      deletedByUserId: 'deleter-1',
      deletedAt: new Date('2026-06-02T00:00:00.000Z'),
    };

    const response = presentAppCalendarEvent(event);

    expect(response).toEqual({
      id: 'event-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      title: 'Midterm',
      description: null,
      type: 'exam',
      scope: {
        type: 'grade',
        id: 'grade-1',
      },
      allDay: true,
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-01T23:59:59.000Z',
    });
    expect(response).not.toHaveProperty('notes');
    expect(response).not.toHaveProperty('schoolId');
    expect(response).not.toHaveProperty('organizationId');
    expect(response).not.toHaveProperty('scopeKey');
    expect(response).not.toHaveProperty('createdByUserId');
    expect(response).not.toHaveProperty('updatedByUserId');
    expect(response).not.toHaveProperty('deletedByUserId');
    expect(response).not.toHaveProperty('deletedAt');
  });

  it('uses a null scope id for school-wide events', () => {
    const event: AppCalendarEventRecord = {
      id: 'event-2',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      title: 'Holiday',
      description: 'No classes',
      notes: null,
      type: AcademicCalendarEventType.HOLIDAY,
      scopeType: AcademicCalendarEventScopeType.SCHOOL,
      scopeKey: null,
      stageId: null,
      gradeId: null,
      sectionId: null,
      allDay: true,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-01T23:59:59.000Z'),
      createdByUserId: 'creator-1',
      updatedByUserId: 'updater-1',
      deletedByUserId: null,
      deletedAt: null,
    };

    expect(presentAppCalendarEvent(event).scope).toEqual({
      type: 'school',
      id: null,
    });
  });
});
