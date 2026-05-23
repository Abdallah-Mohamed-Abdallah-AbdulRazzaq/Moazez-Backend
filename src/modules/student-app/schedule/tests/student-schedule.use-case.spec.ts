import {
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type { StudentAppCurrentStudentWithEnrollment } from '../../shared/student-app.types';
import { GetStudentDailyScheduleUseCase } from '../application/get-student-daily-schedule.use-case';
import { GetStudentWeeklyScheduleUseCase } from '../application/get-student-weekly-schedule.use-case';
import {
  StudentScheduleEntryRecord,
  StudentScheduleReadAdapter,
} from '../infrastructure/student-schedule-read.adapter';

describe('Student Schedule use cases', () => {
  it('returns a daily schedule from active published timetable entries for the active-enrollment classroom', async () => {
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

    expect(scheduleReadAdapter.listPublishedEntriesForStudentOnDay).toHaveBeenCalledWith(
      {
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
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
    expect(result.items[0].subject).toEqual({
      id: 'subject-1',
      name: 'Math',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    });
    expect(result.items[0].teacher).toEqual({
      id: 'teacher-1',
      fullName: 'Ada Lovelace',
    });
    expect(result.items[0].classroom).toEqual({
      id: 'classroom-1',
      name: 'Classroom 1',
      nameAr: 'Classroom 1 AR',
      nameEn: 'Classroom 1',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
  });

  it('returns an empty daily schedule for a valid date outside the published term', async () => {
    const { dailyUseCase, scheduleReadAdapter } = createUseCases({
      entries: [],
    });

    const result = await dailyUseCase.execute({ date: '2027-01-04' });

    expect(scheduleReadAdapter.listPublishedEntriesForStudentOnDay).toHaveBeenCalledWith(
      {
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
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

  it('rejects invalid calendar dates before reading timetable entries', async () => {
    const { dailyUseCase, scheduleReadAdapter } = createUseCases();

    await expect(
      dailyUseCase.execute({ date: '2026-02-31' }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    });
    expect(
      scheduleReadAdapter.listPublishedEntriesForStudentOnDay,
    ).not.toHaveBeenCalled();
  });

  it('rejects non-student actors through the Student App access service', async () => {
    const { dailyUseCase, accessService, scheduleReadAdapter } =
      createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(
      dailyUseCase.execute({ date: '2026-09-14' }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(
      scheduleReadAdapter.listPublishedEntriesForStudentOnDay,
    ).not.toHaveBeenCalled();
  });

  it('groups the weekly schedule using the published timetable weekStartDay', async () => {
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
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    );
    expect(scheduleReadAdapter.listPublishedEntriesForStudentWeek).toHaveBeenCalledWith(
      {
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
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

describe('StudentScheduleReadAdapter', () => {
  it('queries scoped Prisma for active published classroom timetable entries inside the term', async () => {
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
    const adapter = new StudentScheduleReadAdapter({
      scoped: {
        timetableEntry: {
          findMany,
        },
      },
    } as never);

    const result = await adapter.listPublishedEntriesForStudentOnDay({
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      dayOfWeek: 1,
      date: new Date(Date.UTC(2026, 8, 14)),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classroomId: 'classroom-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          status: TimetableEntryStatus.ACTIVE,
          teacherSubjectAllocation: {
            is: {
              classroomId: 'classroom-1',
              termId: 'term-1',
            },
          },
          timetableConfig: {
            is: expect.objectContaining({
              academicYearId: 'year-1',
              termId: 'term-1',
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
});

function createUseCases(params?: {
  entries?: StudentScheduleEntryRecord[];
  weekStartDay?: number;
}): {
  dailyUseCase: GetStudentDailyScheduleUseCase;
  weeklyUseCase: GetStudentWeeklyScheduleUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  scheduleReadAdapter: jest.Mocked<StudentScheduleReadAdapter>;
} {
  const entries = params?.entries ?? [entryFixture()];
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(() =>
      Promise.resolve(currentStudentFixture()),
    ),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const scheduleReadAdapter = {
    listPublishedEntriesForStudentOnDay: jest.fn(() =>
      Promise.resolve(entries),
    ),
    listPublishedEntriesForStudentWeek: jest.fn(() => Promise.resolve(entries)),
    findPublishedScheduleSettings: jest.fn(() =>
      Promise.resolve({
        weekStartDay: params?.weekStartDay ?? 0,
        activeDays: [0, 1, 2, 3, 4],
      }),
    ),
  } as unknown as jest.Mocked<StudentScheduleReadAdapter>;

  return {
    dailyUseCase: new GetStudentDailyScheduleUseCase(
      accessService,
      scheduleReadAdapter,
    ),
    weeklyUseCase: new GetStudentWeeklyScheduleUseCase(
      accessService,
      scheduleReadAdapter,
    ),
    accessService,
    scheduleReadAdapter,
  };
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: {
      studentUserId: 'student-user-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    },
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function entryFixture(
  overrides?: Partial<StudentScheduleEntryRecord>,
): StudentScheduleEntryRecord {
  const base: StudentScheduleEntryRecord = {
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

function termBoundConfigFixture(): StudentScheduleEntryRecord['timetableConfig'] {
  return {
    ...entryFixture().timetableConfig,
    term: {
      startDate: new Date(Date.UTC(2026, 8, 16)),
      endDate: new Date(Date.UTC(2026, 8, 18)),
      deletedAt: null,
    },
  };
}
