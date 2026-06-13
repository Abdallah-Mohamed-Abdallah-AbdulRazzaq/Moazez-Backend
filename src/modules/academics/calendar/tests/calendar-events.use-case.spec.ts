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
import { CreateCalendarEventUseCase } from '../application/create-calendar-event.use-case';
import { DeleteCalendarEventUseCase } from '../application/delete-calendar-event.use-case';
import { UpdateCalendarEventUseCase } from '../application/update-calendar-event.use-case';
import {
  CalendarEventScopeTypeDto,
  CalendarEventTypeDto,
} from '../dto/calendar-event.dto';
import {
  CalendarEventRecord,
  CalendarEventsRepository,
} from '../infrastructure/calendar-events.repository';
import { presentCalendarEvent } from '../presenters/calendar-event.presenter';

const SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const YEAR_ID = '00000000-0000-0000-0000-000000000003';
const TERM_ID = '00000000-0000-0000-0000-000000000004';
const EVENT_ID = '00000000-0000-0000-0000-000000000005';
const CREATED_EVENT_ID = '00000000-0000-0000-0000-000000000006';
const STAGE_ID = '00000000-0000-0000-0000-000000000007';
const GRADE_ID = '00000000-0000-0000-0000-000000000008';
const SECTION_ID = '00000000-0000-0000-0000-000000000009';

describe('Calendar events use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: USER_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'academics.calendar.view',
          'academics.calendar.manage',
        ],
      });

      await testFn();
    });
  }

  function createRepository(
    overrides: Partial<Record<keyof CalendarEventsRepository, jest.Mock>> = {},
  ): CalendarEventsRepository {
    const repository = {
      findAcademicYearForSchool: jest.fn().mockResolvedValue({
        id: YEAR_ID,
        schoolId: SCHOOL_ID,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-08-31T00:00:00.000Z'),
        isActive: true,
      }),
      findTermForSchool: jest.fn().mockResolvedValue({
        id: TERM_ID,
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      }),
      findTermForSchoolYear: jest.fn().mockResolvedValue({
        id: TERM_ID,
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      }),
      findStageForSchool: jest.fn().mockResolvedValue({
        id: STAGE_ID,
        schoolId: SCHOOL_ID,
      }),
      findGradeForSchool: jest.fn().mockResolvedValue({
        id: GRADE_ID,
        schoolId: SCHOOL_ID,
        stageId: STAGE_ID,
      }),
      findSectionForSchool: jest.fn().mockResolvedValue({
        id: SECTION_ID,
        schoolId: SCHOOL_ID,
        gradeId: GRADE_ID,
      }),
      listEvents: jest.fn().mockResolvedValue([]),
      findEventById: jest.fn().mockResolvedValue(eventRecord()),
      createEvent: jest.fn().mockImplementation(async (data) =>
        eventRecord({
          id: CREATED_EVENT_ID,
          schoolId: String(data.schoolId),
          academicYearId: String(data.academicYearId),
          termId: String(data.termId),
          title: String(data.title),
          description: (data.description as string | null) ?? null,
          notes: (data.notes as string | null) ?? null,
          type: data.type as AcademicCalendarEventType,
          scopeType: data.scopeType as AcademicCalendarEventScopeType,
          scopeKey: (data.scopeKey as string | null) ?? null,
          stageId: (data.stageId as string | null) ?? null,
          gradeId: (data.gradeId as string | null) ?? null,
          sectionId: (data.sectionId as string | null) ?? null,
          allDay: Boolean(data.allDay),
          startDate: data.startDate as Date,
          endDate: data.endDate as Date,
          createdByUserId: data.createdByUserId as string,
          updatedByUserId: data.updatedByUserId as string,
        }),
      ),
      updateEvent: jest.fn().mockImplementation(async (eventId, data) =>
        eventRecord({
          id: eventId,
          academicYearId: String(data.academicYearId ?? YEAR_ID),
          termId: String(data.termId ?? TERM_ID),
          title: typeof data.title === 'string' ? data.title : 'Holiday',
          description:
            data.description === undefined
              ? null
              : (data.description as string | null),
          notes: data.notes === undefined ? null : (data.notes as string | null),
          type: (data.type as AcademicCalendarEventType) ?? AcademicCalendarEventType.HOLIDAY,
          scopeType:
            (data.scopeType as AcademicCalendarEventScopeType) ??
            AcademicCalendarEventScopeType.SCHOOL,
          scopeKey: (data.scopeKey as string | null) ?? null,
          stageId: (data.stageId as string | null) ?? null,
          gradeId: (data.gradeId as string | null) ?? null,
          sectionId: (data.sectionId as string | null) ?? null,
          allDay: Boolean(data.allDay),
          startDate: (data.startDate as Date) ?? eventRecord().startDate,
          endDate: (data.endDate as Date) ?? eventRecord().endDate,
          updatedByUserId: data.updatedByUserId as string,
          updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        }),
      ),
      softDeleteEvent: jest.fn().mockImplementation(async (eventId, userId) => ({
        status: 'deleted' as const,
        event: eventRecord({
          id: eventId,
          deletedByUserId: userId,
          deletedAt: new Date('2026-06-03T00:00:00.000Z'),
          updatedByUserId: userId,
          updatedAt: new Date('2026-06-03T00:00:00.000Z'),
        }),
      })),
      ...overrides,
    };

    return repository as unknown as CalendarEventsRepository;
  }

  function createAuthRepository() {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('creates an event after validating school year, term, and scope', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new CreateCalendarEventUseCase(
      repository,
      authRepository as never,
    );

    await withScope(async () => {
      const result = await useCase.execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        title: '  Midterm Week  ',
        description: 'Internal planning note',
        notes: 'Desk copy only',
        type: CalendarEventTypeDto.EXAM,
        scopeType: CalendarEventScopeTypeDto.GRADE,
        scopeId: GRADE_ID,
        allDay: true,
        startDate: '2026-11-10T00:00:00.000Z',
        endDate: '2026-11-12T00:00:00.000Z',
      });

      expect(result).toMatchObject({
        id: CREATED_EVENT_ID,
        title: 'Midterm Week',
        type: CalendarEventTypeDto.EXAM,
        scope: {
          type: CalendarEventScopeTypeDto.GRADE,
          id: GRADE_ID,
        },
      });
      expect(result).not.toHaveProperty('schoolId');
    });

    expect(repository.findAcademicYearForSchool).toHaveBeenCalledWith(YEAR_ID);
    expect(repository.findTermForSchoolYear).toHaveBeenCalledWith(
      TERM_ID,
      YEAR_ID,
    );
    expect(repository.findGradeForSchool).toHaveBeenCalledWith(GRADE_ID);
    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        title: 'Midterm Week',
        type: AcademicCalendarEventType.EXAM,
        scopeType: AcademicCalendarEventScopeType.GRADE,
        scopeKey: GRADE_ID,
        stageId: null,
        gradeId: GRADE_ID,
        sectionId: null,
        createdByUserId: USER_ID,
        updatedByUserId: USER_ID,
      }),
    );

    const auditPayload = authRepository.createAuditLog.mock.calls[0][0];
    expect(auditPayload).toMatchObject({
      action: 'academics.calendar_event.create',
      module: 'academics',
      resourceType: 'academic_calendar_event',
      resourceId: CREATED_EVENT_ID,
    });
    expect(auditPayload.after).toMatchObject({
      id: CREATED_EVENT_ID,
      type: CalendarEventTypeDto.EXAM,
      scopeType: CalendarEventScopeTypeDto.GRADE,
      scopeId: GRADE_ID,
    });
    expect(auditPayload.after).not.toHaveProperty('title');
    expect(auditPayload.after).not.toHaveProperty('description');
    expect(auditPayload.after).not.toHaveProperty('notes');
  });

  it('updates dates and scope after validating range and scope ownership', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new UpdateCalendarEventUseCase(
      repository,
      authRepository as never,
    );

    await withScope(async () => {
      const result = await useCase.execute(EVENT_ID, {
        type: CalendarEventTypeDto.ACTIVITY,
        scopeType: CalendarEventScopeTypeDto.SECTION,
        scopeId: SECTION_ID,
        allDay: false,
        startDate: '2026-12-10T08:00:00.000Z',
        endDate: '2026-12-10T10:00:00.000Z',
      });

      expect(result).toMatchObject({
        id: EVENT_ID,
        type: CalendarEventTypeDto.ACTIVITY,
        scope: {
          type: CalendarEventScopeTypeDto.SECTION,
          id: SECTION_ID,
        },
        allDay: false,
      });
    });

    expect(repository.findSectionForSchool).toHaveBeenCalledWith(SECTION_ID);
    expect(repository.updateEvent).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({
        type: AcademicCalendarEventType.ACTIVITY,
        scopeType: AcademicCalendarEventScopeType.SECTION,
        scopeKey: SECTION_ID,
        stageId: null,
        gradeId: null,
        sectionId: SECTION_ID,
        allDay: false,
        updatedByUserId: USER_ID,
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'academics.calendar_event.update',
      }),
    );
  });

  it('rejects update date ranges where start is after end', async () => {
    const repository = createRepository();
    const useCase = new UpdateCalendarEventUseCase(
      repository,
      createAuthRepository() as never,
    );

    await withScope(async () => {
      await expect(
        useCase.execute(EVENT_ID, {
          startDate: '2026-12-11T00:00:00.000Z',
          endDate: '2026-12-10T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({
        code: 'academics.calendar_event.invalid_date_range',
      });
    });

    expect(repository.updateEvent).not.toHaveBeenCalled();
  });

  it('soft deletes events and audits the delete action', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new DeleteCalendarEventUseCase(
      repository,
      authRepository as never,
    );

    await withScope(async () => {
      await expect(useCase.execute(EVENT_ID)).resolves.toEqual({
        id: EVENT_ID,
        deleted: true,
      });
    });

    expect(repository.softDeleteEvent).toHaveBeenCalledWith(EVENT_ID, USER_ID);
    const auditPayload = authRepository.createAuditLog.mock.calls[0][0];
    expect(auditPayload).toMatchObject({
      action: 'academics.calendar_event.delete',
      resourceId: EVENT_ID,
    });
    expect(auditPayload.after.deletedAt).toBe('2026-06-03T00:00:00.000Z');
  });

  it('presents API enum values and hides tenant/internal fields', () => {
    const presented = presentCalendarEvent(
      eventRecord({
        type: AcademicCalendarEventType.EXAM,
        scopeType: AcademicCalendarEventScopeType.SECTION,
        scopeKey: SECTION_ID,
        sectionId: SECTION_ID,
        deletedAt: new Date('2026-06-03T00:00:00.000Z'),
      }),
    ) as Record<string, unknown>;

    expect(presented.type).toBe(CalendarEventTypeDto.EXAM);
    expect(presented.scope).toEqual({
      type: CalendarEventScopeTypeDto.SECTION,
      id: SECTION_ID,
    });
    expect(presented).not.toHaveProperty('schoolId');
    expect(presented).not.toHaveProperty('organizationId');
    expect(presented).not.toHaveProperty('scopeKey');
    expect(presented).not.toHaveProperty('deletedAt');
    expect(presented).not.toHaveProperty('createdByUserId');
    expect(presented).not.toHaveProperty('updatedByUserId');
    expect(presented).not.toHaveProperty('deletedByUserId');
  });
});

function eventRecord(
  overrides: Partial<CalendarEventRecord> = {},
): CalendarEventRecord {
  return {
    id: EVENT_ID,
    schoolId: SCHOOL_ID,
    academicYearId: YEAR_ID,
    termId: TERM_ID,
    title: 'Holiday',
    description: null,
    notes: null,
    type: AcademicCalendarEventType.HOLIDAY,
    scopeType: AcademicCalendarEventScopeType.SCHOOL,
    scopeKey: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    allDay: true,
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    createdByUserId: USER_ID,
    updatedByUserId: USER_ID,
    deletedByUserId: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}
