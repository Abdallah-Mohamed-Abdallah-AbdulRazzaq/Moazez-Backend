import {
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
  TimetableScopeType,
} from '@prisma/client';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildTodayScheduleUseCase } from '../application/get-parent-child-today-schedule.use-case';
import { GetParentChildWeeklyScheduleUseCase } from '../application/get-parent-child-weekly-schedule.use-case';
import {
  ParentScheduleClock,
  parseParentScheduleDate,
} from '../application/parent-schedule-date';
import {
  ParentScheduleChildRecord,
  ParentScheduleEntryRecord,
  ParentScheduleReadAdapter,
  ParentScheduleSettingsRecord,
} from '../infrastructure/parent-schedule-read.adapter';

describe('Parent Schedule use cases', () => {
  it('returns a today schedule from active published timetable entries for an owned child classroom', async () => {
    const { todayUseCase, scheduleReadAdapter } = createUseCases({
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

    const result = await todayUseCase.execute('student-1');
    const json = JSON.stringify(result);

    expect(
      scheduleReadAdapter.listPublishedEntriesForChildOnDay,
    ).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      dayOfWeek: 1,
      date: new Date(Date.UTC(2026, 8, 14)),
    });
    expect(result).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      child: {
        id: 'student-1',
        displayName: 'Sara Child',
      },
      items: [
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-1:2026-09-14',
          timetableEntryId: 'entry-1',
          status: 'scheduled',
          needsAttendance: true,
          hasHomework: null,
          isExam: null,
          isBreak: false,
        }),
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-break:2026-09-14',
          needsAttendance: false,
          isBreak: true,
        }),
      ],
    });
    expect(result.items[0].teacher).toEqual({
      id: 'teacher-1',
      fullName: 'Ada Lovelace',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
  });

  it('returns an empty today schedule for an owned child when the date has no published term entries', async () => {
    const { todayUseCase, scheduleReadAdapter, clock } = createUseCases({
      entries: [],
    });
    clock.currentDate.mockReturnValue(parseParentScheduleDate('2027-01-04'));

    const result = await todayUseCase.execute('student-1');

    expect(
      scheduleReadAdapter.listPublishedEntriesForChildOnDay,
    ).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      dayOfWeek: 1,
      date: new Date(Date.UTC(2027, 0, 4)),
    });
    expect(result).toEqual({
      date: '2027-01-04',
      dayOfWeek: 1,
      child: {
        id: 'student-1',
        displayName: 'Sara Child',
      },
      items: [],
    });
  });

  it('rejects non-parent actors through the Parent App access service before reading timetable entries', async () => {
    const { todayUseCase, accessService, scheduleReadAdapter } =
      createUseCases();
    accessService.getAccessibleChild.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(todayUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(scheduleReadAdapter.findChildSummary).not.toHaveBeenCalled();
    expect(
      scheduleReadAdapter.listPublishedEntriesForChildOnDay,
    ).not.toHaveBeenCalled();
  });

  it('checks child ownership before reading timetable entries', async () => {
    const { todayUseCase, accessService, scheduleReadAdapter } =
      createUseCases();

    await todayUseCase.execute('student-1');

    expect(accessService.getAccessibleChild).toHaveBeenCalledWith('student-1');
    expect(
      accessService.getAccessibleChild.mock.invocationCallOrder[0],
    ).toBeLessThan(
      scheduleReadAdapter.listPublishedEntriesForChildOnDay.mock
        .invocationCallOrder[0],
    );
  });

  it('groups the weekly schedule using the published timetable weekStartDay', async () => {
    const { weeklyUseCase, scheduleReadAdapter } = createUseCases({
      entries: [
        entryFixture({ id: 'entry-monday', dayOfWeek: 1 }),
        entryFixture({ id: 'entry-wednesday', dayOfWeek: 3 }),
      ],
      weekStartDay: 1,
    });

    const result = await weeklyUseCase.execute('student-1');

    expect(
      scheduleReadAdapter.findPublishedScheduleSettings,
    ).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      requestedDate: new Date(Date.UTC(2026, 8, 14)),
    });
    expect(
      scheduleReadAdapter.listPublishedEntriesForChildWeek,
    ).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      effectiveTimetableConfigIds: ['config-1'],
      dayOfWeeks: [1, 2, 3, 4, 5, 6, 0],
      weekStartDate: new Date(Date.UTC(2026, 8, 14)),
      weekEndDate: new Date(Date.UTC(2026, 8, 20)),
    });
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

  it('uses the first-term settings and winner when a nullable-term child requests a first-term week', async () => {
    const settings = scheduleSettingsFixture({
      weekStartDay: 1,
      activeDays: [1, 2, 3, 4, 5],
      effectiveTimetables: [
        effectiveTimetableBindingFixture({
          timetableConfigId: 'config-a',
          termId: 'term-a',
          termStartDate: new Date(Date.UTC(2026, 0, 1)),
          termEndDate: new Date(Date.UTC(2026, 5, 30)),
          weekStartDay: 1,
        }),
        effectiveTimetableBindingFixture({
          timetableConfigId: 'config-b',
          termId: 'term-b',
          termStartDate: new Date(Date.UTC(2026, 6, 1)),
          termEndDate: new Date(Date.UTC(2026, 11, 31)),
          weekStartDay: 0,
        }),
      ],
    });
    const { weeklyUseCase, scheduleReadAdapter } = createUseCases({
      termId: null,
      currentDate: '2026-03-11',
      settings,
      entries: [
        entryFixture({
          id: 'entry-a',
          dayOfWeek: 3,
          termId: 'term-a',
          timetableConfig: {
            ...entryFixture().timetableConfig,
            id: 'config-a',
            term: {
              startDate: new Date(Date.UTC(2026, 0, 1)),
              endDate: new Date(Date.UTC(2026, 5, 30)),
              deletedAt: null,
            },
          },
        }),
      ],
    });

    const result = await weeklyUseCase.execute('student-1');

    expect(result.weekStartDate).toBe('2026-03-09');
    expect(
      scheduleReadAdapter.listPublishedEntriesForChildWeek,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        termId: null,
        effectiveTimetableConfigIds: ['config-a'],
      }),
    );
    expect(result.days.find((day) => day.date === '2026-03-11')?.items).toEqual(
      [expect.objectContaining({ timetableEntryId: 'entry-a' })],
    );
  });

  it('uses second-term settings and retains both term winners when a nullable-term week crosses the boundary', async () => {
    const settings = scheduleSettingsFixture({
      weekStartDay: 0,
      activeDays: [0, 1, 2, 3, 4],
      effectiveTimetables: [
        effectiveTimetableBindingFixture({
          timetableConfigId: 'config-a',
          termId: 'term-a',
          termStartDate: new Date(Date.UTC(2026, 8, 13)),
          termEndDate: new Date(Date.UTC(2026, 8, 15)),
          weekStartDay: 1,
        }),
        effectiveTimetableBindingFixture({
          timetableConfigId: 'config-b',
          termId: 'term-b',
          termStartDate: new Date(Date.UTC(2026, 8, 16)),
          termEndDate: new Date(Date.UTC(2026, 11, 31)),
          weekStartDay: 0,
        }),
      ],
    });
    const { weeklyUseCase, scheduleReadAdapter } = createUseCases({
      termId: null,
      currentDate: '2026-09-16',
      settings,
      entries: [
        entryFixture({
          id: 'entry-a',
          dayOfWeek: 0,
          termId: 'term-a',
          timetableConfig: {
            ...entryFixture().timetableConfig,
            id: 'config-a',
            term: {
              startDate: new Date(Date.UTC(2026, 8, 13)),
              endDate: new Date(Date.UTC(2026, 8, 15)),
              deletedAt: null,
            },
          },
        }),
        entryFixture({
          id: 'entry-b',
          dayOfWeek: 3,
          termId: 'term-b',
          timetableConfig: {
            ...entryFixture().timetableConfig,
            id: 'config-b',
            term: {
              startDate: new Date(Date.UTC(2026, 8, 16)),
              endDate: new Date(Date.UTC(2026, 11, 31)),
              deletedAt: null,
            },
          },
        }),
      ],
    });

    const result = await weeklyUseCase.execute('student-1');

    expect(result.weekStartDate).toBe('2026-09-13');
    expect(
      scheduleReadAdapter.findPublishedScheduleSettings,
    ).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: null,
      requestedDate: new Date(Date.UTC(2026, 8, 16)),
    });
    expect(
      scheduleReadAdapter.listPublishedEntriesForChildWeek,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        termId: null,
        effectiveTimetableConfigIds: ['config-a', 'config-b'],
      }),
    );
    expect(result.days.find((day) => day.date === '2026-09-13')?.items).toEqual(
      [expect.objectContaining({ timetableEntryId: 'entry-a' })],
    );
    expect(result.days.find((day) => day.date === '2026-09-16')?.items).toEqual(
      [expect.objectContaining({ timetableEntryId: 'entry-b' })],
    );
  });

  it('suppresses weekly items outside term boundaries while preserving seven days', async () => {
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

    const result = await weeklyUseCase.execute('student-1');

    expect(result.days).toHaveLength(7);
    expect(result.days.find((day) => day.date === '2026-09-14')?.items).toEqual(
      [],
    );
    expect(result.days.find((day) => day.date === '2026-09-16')?.items).toEqual(
      [
        expect.objectContaining({
          scheduleId: 'timetable-entry:entry-inside-term:2026-09-16',
          timetableEntryId: 'entry-inside-term',
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

describe('ParentScheduleReadAdapter', () => {
  it('selects requested-date settings and keeps the classroom winner for a nullable second term', async () => {
    const adapter = new ParentScheduleReadAdapter({
      scoped: {
        classroom: {
          findFirst: jest.fn().mockResolvedValue(classroomContextFixture()),
        },
        timetableConfig: {
          findMany: jest.fn().mockResolvedValue([
            effectiveConfigFixture(TimetableScopeType.TERM, {
              id: 'config-a',
              termId: 'term-a',
              weekStartDay: 1,
              term: {
                startDate: new Date(Date.UTC(2026, 0, 1)),
                endDate: new Date(Date.UTC(2026, 5, 30)),
                deletedAt: null,
              },
            }),
            effectiveConfigFixture(TimetableScopeType.TERM, {
              id: 'config-b-parent',
              termId: 'term-b',
              weekStartDay: 0,
              term: {
                startDate: new Date(Date.UTC(2026, 6, 1)),
                endDate: new Date(Date.UTC(2026, 11, 31)),
                deletedAt: null,
              },
            }),
            effectiveConfigFixture(TimetableScopeType.CLASSROOM, {
              id: 'config-b',
              termId: 'term-b',
              weekStartDay: 2,
              activeDays: [2, 3, 4, 5],
              term: {
                startDate: new Date(Date.UTC(2026, 6, 1)),
                endDate: new Date(Date.UTC(2026, 11, 31)),
                deletedAt: null,
              },
            }),
          ]),
        },
      },
    } as never);

    await expect(
      adapter.findPublishedScheduleSettings({
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: null,
        requestedDate: new Date(Date.UTC(2026, 8, 16)),
      }),
    ).resolves.toMatchObject({
      weekStartDay: 2,
      activeDays: [2, 3, 4, 5],
      effectiveTimetables: [
        expect.objectContaining({
          timetableConfigId: 'config-a',
          termId: 'term-a',
        }),
        expect.objectContaining({
          timetableConfigId: 'config-b',
          termId: 'term-b',
        }),
      ],
    });
  });

  it('queries scoped Prisma for active published child classroom timetable entries inside the term', async () => {
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
    const adapter = new ParentScheduleReadAdapter({
      scoped: {
        timetableEntry: {
          findMany,
        },
      },
    } as never);

    const result = await adapter.listPublishedEntriesForChildOnDay({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      effectiveTimetableConfigIds: ['config-1'],
      dayOfWeek: 1,
      date: new Date(Date.UTC(2026, 8, 14)),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classroomId: 'classroom-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          timetableConfigId: { in: ['config-1'] },
          status: TimetableEntryStatus.ACTIVE,
          teacherSubjectAllocation: {
            is: {
              classroomId: 'classroom-1',
              termId: 'term-1',
            },
          },
          timetableConfig: {
            is: expect.objectContaining({
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

  it('loads the schedule child summary only for the owned active enrollment context', async () => {
    const findFirst = jest.fn().mockResolvedValue(childFixture());
    const adapter = new ParentScheduleReadAdapter({
      scoped: {
        enrollment: {
          findFirst,
        },
      },
    } as never);

    await expect(
      adapter.findChildSummary(accessibleChildFixture()),
    ).resolves.toMatchObject({
      studentId: 'student-1',
      student: {
        firstName: 'Sara',
        lastName: 'Child',
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'enrollment-1',
          studentId: 'student-1',
          academicYearId: 'year-1',
          termId: 'term-1',
        },
      }),
    );
  });
});

function createUseCases(params?: {
  entries?: ParentScheduleEntryRecord[];
  weekStartDay?: number;
  termId?: string | null;
  currentDate?: string;
  settings?: ParentScheduleSettingsRecord | null;
}): {
  todayUseCase: GetParentChildTodayScheduleUseCase;
  weeklyUseCase: GetParentChildWeeklyScheduleUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  scheduleReadAdapter: jest.Mocked<ParentScheduleReadAdapter>;
  clock: jest.Mocked<ParentScheduleClock>;
} {
  const entries = params?.entries ?? [entryFixture()];
  const termId = params?.termId === undefined ? 'term-1' : params.termId;
  const settings =
    params && 'settings' in params
      ? params.settings
      : scheduleSettingsFixture({
          weekStartDay: params?.weekStartDay ?? 0,
        });
  const accessService = {
    getAccessibleChild: jest.fn(() =>
      Promise.resolve(accessibleChildFixture(termId)),
    ),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const scheduleReadAdapter = {
    findChildSummary: jest.fn(() => Promise.resolve(childFixture())),
    listPublishedEntriesForChildOnDay: jest.fn(() => Promise.resolve(entries)),
    listPublishedEntriesForChildWeek: jest.fn(() => Promise.resolve(entries)),
    findPublishedScheduleSettings: jest.fn(() => Promise.resolve(settings)),
  } as unknown as jest.Mocked<ParentScheduleReadAdapter>;
  const clock = {
    currentDate: jest.fn(() =>
      parseParentScheduleDate(params?.currentDate ?? '2026-09-14'),
    ),
  } as unknown as jest.Mocked<ParentScheduleClock>;

  return {
    todayUseCase: new GetParentChildTodayScheduleUseCase(
      accessService,
      scheduleReadAdapter,
      clock,
    ),
    weeklyUseCase: new GetParentChildWeeklyScheduleUseCase(
      accessService,
      scheduleReadAdapter,
      clock,
    ),
    accessService,
    scheduleReadAdapter,
    clock,
  };
}

function accessibleChildFixture(
  termId: string | null = 'term-1',
): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId,
  };
}

function childFixture(
  overrides?: Partial<ParentScheduleChildRecord>,
): ParentScheduleChildRecord {
  const base: ParentScheduleChildRecord = {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Child',
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function entryFixture(
  overrides?: Partial<ParentScheduleEntryRecord>,
): ParentScheduleEntryRecord {
  const base: ParentScheduleEntryRecord = {
    id: 'entry-1',
    dayOfWeek: 1,
    notes: 'Bring workbook',
    status: TimetableEntryStatus.ACTIVE,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    timetableConfig: {
      id: 'config-1',
      weekStartDay: 0,
      activeDays: [0, 1, 2, 3, 4],
      status: TimetableConfigStatus.ACTIVE,
      scopeType: TimetableScopeType.TERM,
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
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
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    teacherUser: {
      id: 'teacher-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Classroom 1 AR',
      nameEn: 'Classroom 1',
      sectionId: 'section-1',
      section: {
        gradeId: 'grade-1',
        grade: { stageId: 'stage-1' },
      },
    },
    room: {
      id: 'room-1',
      nameAr: 'Room 1 AR',
      nameEn: 'Room 1',
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function termBoundConfigFixture(): ParentScheduleEntryRecord['timetableConfig'] {
  return {
    ...entryFixture().timetableConfig,
    term: {
      startDate: new Date(Date.UTC(2026, 8, 16)),
      endDate: new Date(Date.UTC(2026, 8, 18)),
      deletedAt: null,
    },
  };
}

function classroomContextFixture() {
  return {
    id: 'classroom-1',
    schoolId: 'school-1',
    sectionId: 'section-1',
    section: {
      gradeId: 'grade-1',
      grade: { stageId: 'stage-1' },
    },
  };
}

function effectiveConfigFixture(
  scopeType: TimetableScopeType,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `config-${scopeType.toLowerCase()}`,
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    name: 'Effective timetable',
    weekStartDay: 0,
    activeDays: [0, 1, 2, 3, 4],
    status: TimetableConfigStatus.ACTIVE,
    scopeType,
    scopeKey: `${scopeType.toLowerCase()}:scope-id`,
    stageId: scopeType === TimetableScopeType.STAGE ? 'stage-1' : null,
    gradeId: scopeType === TimetableScopeType.GRADE ? 'grade-1' : null,
    sectionId: scopeType === TimetableScopeType.SECTION ? 'section-1' : null,
    classroomId:
      scopeType === TimetableScopeType.CLASSROOM ? 'classroom-1' : null,
    term: {
      startDate: new Date(Date.UTC(2026, 8, 1)),
      endDate: new Date(Date.UTC(2026, 11, 31)),
      deletedAt: null,
    },
    publications: [
      { status: TimetablePublicationStatus.PUBLISHED, revision: 1 },
    ],
    ...overrides,
  };
}

function scheduleSettingsFixture(
  overrides: Partial<ParentScheduleSettingsRecord> = {},
): ParentScheduleSettingsRecord {
  return {
    weekStartDay: 0,
    activeDays: [0, 1, 2, 3, 4],
    effectiveTimetables: [effectiveTimetableBindingFixture()],
    ...overrides,
  };
}

function effectiveTimetableBindingFixture(
  overrides: Partial<
    ParentScheduleSettingsRecord['effectiveTimetables'][number]
  > = {},
): ParentScheduleSettingsRecord['effectiveTimetables'][number] {
  return {
    timetableConfigId: 'config-1',
    termId: 'term-1',
    termStartDate: new Date(Date.UTC(2026, 8, 1)),
    termEndDate: new Date(Date.UTC(2026, 11, 31)),
    weekStartDay: 0,
    activeDays: [0, 1, 2, 3, 4],
    ...overrides,
  };
}
