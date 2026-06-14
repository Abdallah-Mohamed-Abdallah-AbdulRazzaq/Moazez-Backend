import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { GetAcademicsOverviewUseCase } from '../application/get-academics-overview.use-case';
import { AcademicsOverviewInvalidContextException } from '../domain/academics-overview.exceptions';
import {
  AcademicsOverviewAcademicYearRecord,
  AcademicsOverviewRepository,
  AcademicsOverviewTermRecord,
  AcademicsOverviewUpcomingEventRecord,
} from '../infrastructure/academics-overview.repository';
import {
  EMPTY_ACADEMICS_OVERVIEW_COUNTS,
  presentAcademicsOverview,
} from '../presenters/academics-overview.presenter';

const SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const YEAR_ID = '00000000-0000-0000-0000-000000000003';
const TERM_ID = '00000000-0000-0000-0000-000000000004';
const OTHER_YEAR_ID = '00000000-0000-0000-0000-000000000005';
const EVENT_ID = '00000000-0000-0000-0000-000000000006';
const SECTION_ID = '00000000-0000-0000-0000-000000000007';
const SCOPE_KEY = '00000000-0000-0000-0000-000000000008';
const NOW = new Date('2026-06-14T10:00:00.000Z');

describe('GetAcademicsOverviewUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: USER_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['academics.overview.view'],
      });

      await testFn();
    });
  }

  function createRepository(
    overrides: Partial<Record<keyof AcademicsOverviewRepository, jest.Mock>> = {},
  ): AcademicsOverviewRepository {
    const repository = {
      findActiveAcademicYear: jest.fn().mockResolvedValue(academicYearRecord()),
      findAcademicYearById: jest.fn().mockResolvedValue(academicYearRecord()),
      findActiveTermForYear: jest.fn().mockResolvedValue(termRecord()),
      findTermById: jest.fn().mockResolvedValue(termRecord()),
      countStructure: jest.fn().mockResolvedValue({
        stagesCount: 2,
        gradesCount: 4,
        sectionsCount: 8,
        classroomsCount: 8,
      }),
      countSubjects: jest.fn().mockResolvedValue({
        subjectsCount: 12,
        activeSubjectsCount: 10,
      }),
      countRooms: jest.fn().mockResolvedValue({ roomsCount: 6 }),
      countTeacherAllocations: jest.fn().mockResolvedValue({
        allocationsCount: 9,
        allocatedTeachersCount: 5,
        allocatedSubjectsCount: 7,
      }),
      countCurriculum: jest.fn().mockResolvedValue({
        curriculaCount: 4,
        activeCurriculaCount: 3,
        unitsCount: 18,
        lessonsCount: 72,
      }),
      countLessonPlans: jest.fn().mockResolvedValue({
        lessonPlansCount: 6,
        plannedItemsCount: 30,
      }),
      countTimetable: jest.fn().mockResolvedValue({
        entriesCount: 40,
        activeEntriesCount: 36,
      }),
      countCalendarEvents: jest.fn().mockResolvedValue({
        eventsCount: 3,
        upcomingEventsCount: 2,
      }),
      listUpcomingCalendarEvents: jest
        .fn()
        .mockResolvedValue([upcomingEventRecord()]),
      ...overrides,
    };

    return repository as unknown as AcademicsOverviewRepository;
  }

  it('returns a zero-safe overview when no active academic year exists', async () => {
    const repository = createRepository({
      findActiveAcademicYear: jest.fn().mockResolvedValue(null),
    });
    const useCase = new GetAcademicsOverviewUseCase(repository);

    await withScope(async () => {
      const result = await useCase.execute({});

      expect(result.academicContext).toEqual({
        academicYear: null,
        term: null,
      });
      expect(result.structure).toEqual({
        stagesCount: 0,
        gradesCount: 0,
        sectionsCount: 0,
        classroomsCount: 0,
      });
      expect(result.upcomingEvents).toEqual([]);
      expect(result.setupIndicators).toMatchObject({
        hasAcademicYear: false,
        hasTerm: false,
        readyForScheduling: false,
        readyForLearningFlow: false,
      });
    });

    expect(repository.countStructure).not.toHaveBeenCalled();
    expect(repository.countCalendarEvents).not.toHaveBeenCalled();
  });

  it('resolves the active academic year and term when the query is omitted', async () => {
    const repository = createRepository();
    const useCase = new GetAcademicsOverviewUseCase(repository);

    await withScope(async () => {
      const result = await useCase.execute({});

      expect(result.generatedAt).toBe('2026-06-14T10:00:00.000Z');
      expect(result.academicContext.academicYear?.id).toBe(YEAR_ID);
      expect(result.academicContext.term?.id).toBe(TERM_ID);
      expect(result.calendar).toEqual({
        eventsCount: 3,
        upcomingEventsCount: 2,
      });
    });

    expect(repository.findActiveAcademicYear).toHaveBeenCalledTimes(1);
    expect(repository.findActiveTermForYear).toHaveBeenCalledWith(YEAR_ID);
    expect(repository.countCalendarEvents).toHaveBeenCalledWith(
      { academicYearId: YEAR_ID, termId: TERM_ID },
      NOW,
    );
    expect(repository.listUpcomingCalendarEvents).toHaveBeenCalledWith(
      { academicYearId: YEAR_ID, termId: TERM_ID },
      NOW,
      5,
    );
  });

  it('validates that a provided term belongs to the provided academic year', async () => {
    const repository = createRepository({
      findAcademicYearById: jest.fn().mockResolvedValue(academicYearRecord()),
      findTermById: jest
        .fn()
        .mockResolvedValue(termRecord({ academicYearId: OTHER_YEAR_ID })),
    });
    const useCase = new GetAcademicsOverviewUseCase(repository);

    await withScope(async () => {
      await expect(
        useCase.execute({ academicYearId: YEAR_ID, termId: TERM_ID }),
      ).rejects.toBeInstanceOf(AcademicsOverviewInvalidContextException);
    });

    expect(repository.countStructure).not.toHaveBeenCalled();
  });

  it('computes setup indicators from overview counts', async () => {
    const repository = createRepository();
    const useCase = new GetAcademicsOverviewUseCase(repository);

    await withScope(async () => {
      const result = await useCase.execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      });

      expect(result.setupIndicators).toEqual({
        hasAcademicYear: true,
        hasTerm: true,
        hasStructure: true,
        hasSubjects: true,
        hasRooms: true,
        hasTeacherAllocations: true,
        hasCurriculum: true,
        hasLessonPlans: true,
        hasTimetable: true,
        hasCalendarEvents: true,
        readyForScheduling: true,
        readyForLearningFlow: true,
      });
    });
  });

  it('includes upcoming calendar events with a safe response shape', async () => {
    const repository = createRepository();
    const useCase = new GetAcademicsOverviewUseCase(repository);

    await withScope(async () => {
      const result = await useCase.execute({});

      expect(result.upcomingEvents).toEqual([
        {
          id: EVENT_ID,
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          title: 'Science fair',
          type: 'activity',
          scope: {
            type: 'section',
            id: SECTION_ID,
          },
          allDay: false,
          startDate: '2026-06-20T08:00:00.000Z',
          endDate: '2026-06-20T10:00:00.000Z',
        },
      ]);
      expectObjectKeysNotToContain(result, [
        'schoolId',
        'organizationId',
        'scopeKey',
        'createdByUserId',
        'updatedByUserId',
        'deletedByUserId',
        'deletedAt',
      ]);
    });
  });

  it('maps calendar enum values to lowercase API values in the presenter', () => {
    const result = presentAcademicsOverview({
      generatedAt: NOW,
      academicYear: academicYearRecord(),
      term: termRecord(),
      counts: EMPTY_ACADEMICS_OVERVIEW_COUNTS,
      upcomingEvents: [
        upcomingEventRecord({
          type: AcademicCalendarEventType.EXAM,
          scopeType: AcademicCalendarEventScopeType.GRADE,
          gradeId: SCOPE_KEY,
          sectionId: null,
        }),
      ],
    });

    expect(result.upcomingEvents[0]).toMatchObject({
      type: 'exam',
      scope: {
        type: 'grade',
        id: SCOPE_KEY,
      },
    });
  });
});

function academicYearRecord(
  overrides: Partial<AcademicsOverviewAcademicYearRecord> = {},
): AcademicsOverviewAcademicYearRecord {
  return {
    id: YEAR_ID,
    schoolId: SCHOOL_ID,
    nameAr: '2026-2027',
    nameEn: '2026-2027',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2027-08-31T00:00:00.000Z'),
    isActive: true,
    ...overrides,
  };
}

function termRecord(
  overrides: Partial<AcademicsOverviewTermRecord> = {},
): AcademicsOverviewTermRecord {
  return {
    id: TERM_ID,
    schoolId: SCHOOL_ID,
    academicYearId: YEAR_ID,
    nameAr: 'Term 1',
    nameEn: 'Term 1',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2027-01-31T00:00:00.000Z'),
    isActive: true,
    ...overrides,
  };
}

function upcomingEventRecord(
  overrides: Partial<AcademicsOverviewUpcomingEventRecord> = {},
): AcademicsOverviewUpcomingEventRecord {
  return {
    id: EVENT_ID,
    schoolId: SCHOOL_ID,
    academicYearId: YEAR_ID,
    termId: TERM_ID,
    title: 'Science fair',
    type: AcademicCalendarEventType.ACTIVITY,
    scopeType: AcademicCalendarEventScopeType.SECTION,
    scopeKey: SECTION_ID,
    stageId: null,
    gradeId: null,
    sectionId: SECTION_ID,
    allDay: false,
    startDate: new Date('2026-06-20T08:00:00.000Z'),
    endDate: new Date('2026-06-20T10:00:00.000Z'),
    createdByUserId: USER_ID,
    updatedByUserId: USER_ID,
    deletedByUserId: USER_ID,
    deletedAt: new Date('2026-06-21T00:00:00.000Z'),
    ...overrides,
  };
}

function expectObjectKeysNotToContain(
  value: unknown,
  forbiddenKeys: string[],
): void {
  const keys = collectObjectKeys(value);

  for (const forbiddenKey of forbiddenKeys) {
    expect(keys).not.toContain(forbiddenKey);
  }
}

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, keys);
    }

    return keys;
  }

  if (!value || typeof value !== 'object') {
    return keys;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nestedValue, keys);
  }

  return keys;
}
