import {
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
} from '@prisma/client';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import { GetTeacherDailyScheduleUseCase } from '../application/get-teacher-daily-schedule.use-case';
import { GetTeacherWeeklyScheduleUseCase } from '../application/get-teacher-weekly-schedule.use-case';
import {
  TeacherScheduleEntryRecord,
  TeacherScheduleReadAdapter,
} from '../infrastructure/teacher-schedule-read.adapter';

const TEACHER_ID = 'teacher-1';

describe('Teacher Schedule use cases', () => {
  it('returns a daily schedule from active published timetable entries only for the current teacher', async () => {
    const { dailyUseCase, scheduleReadAdapter } = createUseCases({
      entries: [
        entryFixture(),
        entryFixture({
          id: 'entry-break',
          period: {
            ...entryFixture().period,
            id: 'period-break',
            periodIndex: 2,
            label: 'Break',
            type: TimetablePeriodType.BREAK,
            isInstructional: false,
          },
        }),
      ],
    });

    const result = await dailyUseCase.execute({ date: '2026-09-14' });
    const json = JSON.stringify(result);

    expect(scheduleReadAdapter.listPublishedEntriesForTeacherOnDay).toHaveBeenCalledWith(
      {
        teacherUserId: TEACHER_ID,
        allocationIds: ['allocation-1'],
        dayOfWeek: 1,
        date: new Date(Date.UTC(2026, 8, 14)),
      },
    );
    expect(result).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-1:2026-09-14',
          timetableEntryId: 'entry-1',
          teacherSubjectAllocationId: 'allocation-1',
          classId: 'allocation-1',
          status: 'scheduled',
          needsAttendance: true,
          isPrepared: null,
          hasHomework: null,
        }),
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-break:2026-09-14',
          needsAttendance: false,
        }),
      ],
    });
    expect(result.items[0].subject).toEqual({
      id: 'subject-1',
      name: 'Math',
      nameAr: 'رياضيات',
      nameEn: 'Math',
      code: 'MATH',
    });
    expect(result.items[0].classroom).toEqual({
      id: 'classroom-1',
      name: 'Classroom 1',
      nameAr: 'الفصل 1',
      nameEn: 'Classroom 1',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
  });

  it('returns an empty daily schedule for a valid teacher/date with no entries', async () => {
    const { dailyUseCase } = createUseCases({ entries: [] });

    await expect(
      dailyUseCase.execute({ date: '2026-09-15' }),
    ).resolves.toEqual({
      date: '2026-09-15',
      dayOfWeek: 2,
      items: [],
    });
  });

  it('returns an empty daily schedule when the date is outside the published term', async () => {
    const { dailyUseCase, scheduleReadAdapter } = createUseCases({
      entries: [],
    });

    const result = await dailyUseCase.execute({ date: '2027-01-04' });

    expect(scheduleReadAdapter.listPublishedEntriesForTeacherOnDay).toHaveBeenCalledWith(
      {
        teacherUserId: TEACHER_ID,
        allocationIds: ['allocation-1'],
        dayOfWeek: 1,
        date: new Date(Date.UTC(2027, 0, 4)),
      },
    );
    expect(result).toEqual({
      date: '2027-01-04',
      dayOfWeek: 1,
      items: [],
    });
  });

  it('rejects invalid calendar dates before reading the timetable', async () => {
    const { dailyUseCase, scheduleReadAdapter } = createUseCases();

    await expect(
      dailyUseCase.execute({ date: '2026-02-31' }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    });
    expect(
      scheduleReadAdapter.listPublishedEntriesForTeacherOnDay,
    ).not.toHaveBeenCalled();
  });

  it('rejects non-teacher actors through the Teacher App access service', async () => {
    const { dailyUseCase, accessService, scheduleReadAdapter } =
      createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(
      dailyUseCase.execute({ date: '2026-09-14' }),
    ).rejects.toMatchObject({
      code: 'teacher_app.actor.required_teacher',
    });
    expect(
      scheduleReadAdapter.listPublishedEntriesForTeacherOnDay,
    ).not.toHaveBeenCalled();
  });

  it('groups the weekly schedule using the timetable config weekStartDay', async () => {
    const { weeklyUseCase, scheduleReadAdapter } = createUseCases({
      entries: [
        entryFixture({ id: 'entry-monday', dayOfWeek: 1 }),
        entryFixture({ id: 'entry-wednesday', dayOfWeek: 3 }),
      ],
      weekStartDay: 1,
    });

    const result = await weeklyUseCase.execute({ date: '2026-09-16' });

    expect(scheduleReadAdapter.findPublishedScheduleSettings).toHaveBeenCalledWith(
      {
        teacherUserId: TEACHER_ID,
        allocationIds: ['allocation-1'],
      },
    );
    expect(scheduleReadAdapter.listPublishedEntriesForTeacherWeek).toHaveBeenCalledWith(
      {
        teacherUserId: TEACHER_ID,
        allocationIds: ['allocation-1'],
        dayOfWeeks: [1, 2, 3, 4, 5, 6, 0],
        weekStartDate: new Date(Date.UTC(2026, 8, 14)),
        weekEndDate: new Date(Date.UTC(2026, 8, 20)),
      },
    );
    expect(result.weekStartDate).toBe('2026-09-14');
    expect(result.weekEndDate).toBe('2026-09-20');
    expect(result.days).toHaveLength(7);
    expect(result.days[0]).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-monday:2026-09-14',
        }),
      ],
    });
    expect(result.days[2]).toMatchObject({
      date: '2026-09-16',
      dayOfWeek: 3,
      items: [
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-wednesday:2026-09-16',
        }),
      ],
    });
  });

  it('suppresses weekly items outside the entry term while preserving seven days', async () => {
    const { weeklyUseCase } = createUseCases({
      entries: [
        entryFixture({
          id: 'entry-before-term',
          dayOfWeek: 1,
          timetableConfig: termBoundConfigFixture(),
        }),
        entryFixture({
          id: 'entry-inside-term',
          dayOfWeek: 3,
          timetableConfig: termBoundConfigFixture(),
        }),
        entryFixture({
          id: 'entry-after-term',
          dayOfWeek: 0,
          timetableConfig: termBoundConfigFixture(),
        }),
      ],
      weekStartDay: 1,
    });

    const result = await weeklyUseCase.execute({ date: '2026-09-16' });

    expect(result.days).toHaveLength(7);
    expect(result.weekStartDate).toBe('2026-09-14');
    expect(result.weekEndDate).toBe('2026-09-20');
    expect(result.days.find((day) => day.date === '2026-09-14')?.items).toEqual(
      [],
    );
    expect(result.days.find((day) => day.date === '2026-09-16')?.items).toEqual(
      [
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-inside-term:2026-09-16',
          timetableEntryId: 'entry-inside-term',
          classId: 'allocation-1',
        }),
      ],
    );
    expect(result.days.find((day) => day.date === '2026-09-20')?.items).toEqual(
      [],
    );
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('organizationId');
  });
});

describe('TeacherScheduleReadAdapter', () => {
  it('queries scoped Prisma for active published teacher-owned timetable entries', async () => {
    const findMany = jest.fn().mockResolvedValue([
      entryFixture(),
      entryFixture({
        id: 'entry-inactive-day',
        dayOfWeek: 5,
        timetableConfig: {
          ...entryFixture().timetableConfig,
          activeDays: [1],
        },
      }),
    ]);
    const adapter = new TeacherScheduleReadAdapter({
      scoped: {
        timetableEntry: {
          findMany,
        },
      },
    } as never);

    const result = await adapter.listPublishedEntriesForTeacherOnDay({
      teacherUserId: TEACHER_ID,
      allocationIds: ['allocation-1'],
      dayOfWeek: 1,
      date: new Date(Date.UTC(2026, 8, 14)),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherUserId: TEACHER_ID,
          teacherSubjectAllocationId: { in: ['allocation-1'] },
          status: TimetableEntryStatus.ACTIVE,
          teacherSubjectAllocation: {
            is: { teacherUserId: TEACHER_ID },
          },
          timetableConfig: {
            is: expect.objectContaining({
              status: TimetableConfigStatus.ACTIVE,
              publications: {
                some: {
                  status: 'PUBLISHED',
                },
              },
              activeDays: { has: 1 },
              term: {
                is: {
                  startDate: { lte: new Date(Date.UTC(2026, 8, 14)) },
                  endDate: { gte: new Date(Date.UTC(2026, 8, 14)) },
                  deletedAt: null,
                },
              },
            }),
          },
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('entry-1');
  });

  it('does not query timetable entries when the teacher has no owned allocations', async () => {
    const findMany = jest.fn();
    const findFirst = jest.fn();
    const adapter = new TeacherScheduleReadAdapter({
      scoped: {
        timetableEntry: {
          findMany,
          findFirst,
        },
      },
    } as never);

    await expect(
      adapter.listPublishedEntriesForTeacherWeek({
        teacherUserId: TEACHER_ID,
        allocationIds: [],
        dayOfWeeks: [1, 2, 3],
        weekStartDate: new Date(Date.UTC(2026, 8, 14)),
        weekEndDate: new Date(Date.UTC(2026, 8, 20)),
      }),
    ).resolves.toEqual([]);
    await expect(
      adapter.findPublishedScheduleSettings({
        teacherUserId: TEACHER_ID,
        allocationIds: [],
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

function createUseCases(params?: {
  entries?: TeacherScheduleEntryRecord[];
  weekStartDay?: number;
}): {
  dailyUseCase: GetTeacherDailyScheduleUseCase;
  weeklyUseCase: GetTeacherWeeklyScheduleUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  scheduleReadAdapter: jest.Mocked<TeacherScheduleReadAdapter>;
} {
  const entries = params?.entries ?? [entryFixture()];
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    listOwnedTeacherAllocationIds: jest.fn(() =>
      Promise.resolve(['allocation-1']),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const scheduleReadAdapter = {
    listPublishedEntriesForTeacherOnDay: jest.fn(() =>
      Promise.resolve(entries),
    ),
    listPublishedEntriesForTeacherWeek: jest.fn(() => Promise.resolve(entries)),
    findPublishedScheduleSettings: jest.fn(() =>
      Promise.resolve({
        weekStartDay: params?.weekStartDay ?? 0,
        activeDays: [0, 1, 2, 3, 4],
      }),
    ),
  } as unknown as jest.Mocked<TeacherScheduleReadAdapter>;

  return {
    dailyUseCase: new GetTeacherDailyScheduleUseCase(
      accessService,
      scheduleReadAdapter,
    ),
    weeklyUseCase: new GetTeacherWeeklyScheduleUseCase(
      accessService,
      scheduleReadAdapter,
    ),
    accessService,
    scheduleReadAdapter,
  };
}

function entryFixture(
  overrides?: Partial<TeacherScheduleEntryRecord>,
): TeacherScheduleEntryRecord {
  const base: TeacherScheduleEntryRecord = {
    id: 'entry-1',
    teacherUserId: TEACHER_ID,
    teacherSubjectAllocationId: 'allocation-1',
    dayOfWeek: 1,
    notes: 'Bring workbook',
    status: TimetableEntryStatus.ACTIVE,
    timetableConfig: {
      id: 'config-1',
      weekStartDay: 0,
      activeDays: [0, 1, 2, 3, 4],
      status: TimetableConfigStatus.ACTIVE,
      term: {
        startDate: new Date(Date.UTC(2026, 8, 1)),
        endDate: new Date(Date.UTC(2026, 11, 31)),
        deletedAt: null,
      },
    },
    period: {
      id: 'period-1',
      periodIndex: 1,
      label: 'Period 1',
      startTime: '08:00',
      endTime: '08:45',
      type: TimetablePeriodType.CLASS,
      isInstructional: true,
    },
    subject: {
      id: 'subject-1',
      nameAr: 'رياضيات',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'الفصل 1',
      nameEn: 'Classroom 1',
    },
    room: {
      id: 'room-1',
      nameAr: 'غرفة 1',
      nameEn: 'Room 1',
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function termBoundConfigFixture(): TeacherScheduleEntryRecord['timetableConfig'] {
  return {
    ...entryFixture().timetableConfig,
    term: {
      startDate: new Date(Date.UTC(2026, 8, 16)),
      endDate: new Date(Date.UTC(2026, 8, 18)),
      deletedAt: null,
    },
  };
}
