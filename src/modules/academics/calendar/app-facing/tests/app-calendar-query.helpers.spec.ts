import {
  normalizeCalendarListWindow,
} from '../../application/calendar-event-use-case.helpers';
import {
  resolveAppCalendarAcademicFilters,
  validateAppCalendarAcademicFilters,
} from '../application/app-calendar-query.helpers';
import type { AppCalendarEventsRepository } from '../infrastructure/app-calendar-events.repository';

describe('AppCalendar query helpers', () => {
  it('rejects invalid date ranges', () => {
    expect(() =>
      normalizeCalendarListWindow({
        from: '2026-06-02T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      }),
    ).toThrow('Academic calendar event list date range is invalid');
  });

  it('rejects excessive date ranges', () => {
    expect(() =>
      normalizeCalendarListWindow({
        from: '2026-01-01T00:00:00.000Z',
        to: '2027-02-01T00:00:00.000Z',
      }),
    ).toThrow('Academic calendar event list date range is invalid');
  });

  it('hard-bounds student and parent filters to current enrollment context', () => {
    expect(() =>
      resolveAppCalendarAcademicFilters(
        {
          actorKind: 'student',
          schoolId: 'school-1',
          academicYearId: 'year-current',
          termId: 'term-current',
          visibleStageIds: [],
          visibleGradeIds: [],
          visibleSectionIds: [],
        },
        {
          academicYearId: 'year-other',
        },
      ),
    ).toThrow('Academic calendar event scope is invalid');

    expect(() =>
      resolveAppCalendarAcademicFilters(
        {
          actorKind: 'parent',
          schoolId: 'school-1',
          academicYearId: 'year-current',
          termId: 'term-current',
          visibleStageIds: [],
          visibleGradeIds: [],
          visibleSectionIds: [],
        },
        {
          termId: 'term-other',
        },
      ),
    ).toThrow('Academic calendar event scope is invalid');
  });

  it('rejects unrelated academic year and term filters', async () => {
    const repository = {
      findAcademicYearForSchool: jest.fn().mockResolvedValue({
        id: 'year-1',
      }),
      findTermForSchoolYear: jest.fn().mockResolvedValue(null),
    } as unknown as AppCalendarEventsRepository;

    await expect(
      validateAppCalendarAcademicFilters(repository, {
        academicYearId: 'year-1',
        termId: 'term-other',
      }),
    ).rejects.toThrow('Academic calendar event scope is invalid');
  });
});
