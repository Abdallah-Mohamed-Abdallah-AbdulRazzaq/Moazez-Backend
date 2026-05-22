import { readFileSync } from 'node:fs';
import {
  TimetableConfigStatus,
  TimetableConflictSeverity,
  TimetableConflictStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { CreateTimetablePeriodUseCase } from '../application/create-timetable-period.use-case';
import { DeleteTimetablePeriodUseCase } from '../application/delete-timetable-period.use-case';
import { GetTimetableConfigUseCase } from '../application/get-timetable-config.use-case';
import { ListTimetableConflictsUseCase } from '../application/list-timetable-conflicts.use-case';
import { ListTimetablePeriodsUseCase } from '../application/list-timetable-periods.use-case';
import { UpdateTimetablePeriodUseCase } from '../application/update-timetable-period.use-case';
import { UpsertTimetableConfigUseCase } from '../application/upsert-timetable-config.use-case';
import { computeTimetableConflicts } from '../domain/timetable-conflicts';
import { TimetableRepository } from '../infrastructure/timetable.repository';

type ConfigRecord = Awaited<
  ReturnType<TimetableRepository['findConfigById']>
> & {};
type PeriodRecord = Awaited<
  ReturnType<TimetableRepository['findPeriodById']>
> & {};
type EntryRecord = Awaited<
  ReturnType<TimetableRepository['listEntriesForConfig']>
>[number];

describe('Timetable use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['academics.structure.view', 'academics.structure.manage'],
      });

      await testFn();
    });
  }

  function createRepository(seed?: {
    configs?: NonNullable<ConfigRecord>[];
    periods?: NonNullable<PeriodRecord>[];
    entries?: EntryRecord[];
    termActive?: boolean;
  }): TimetableRepository {
    const configs = [...(seed?.configs ?? [])];
    const periods = [...(seed?.periods ?? [])];
    const entries = [...(seed?.entries ?? [])];
    const conflicts: never[] = [];
    const now = new Date('2026-05-22T10:00:00.000Z');

    return {
      findAcademicYearById: jest.fn().mockImplementation(async (id: string) =>
        id === 'year-1'
          ? { id: 'year-1', schoolId: 'school-1', isActive: true }
          : null,
      ),
      findTermById: jest.fn().mockImplementation(async (id: string) =>
        id === 'term-1'
          ? {
              id: 'term-1',
              schoolId: 'school-1',
              academicYearId: 'year-1',
              isActive: seed?.termActive ?? true,
            }
          : null,
      ),
      findGradeById: jest.fn().mockResolvedValue(null),
      findSectionById: jest.fn().mockResolvedValue(null),
      findClassroomById: jest.fn().mockResolvedValue(null),
      findConfigByScope: jest.fn().mockImplementation(async (input) =>
        configs.find(
          (config) =>
            config.academicYearId === input.academicYearId &&
            config.termId === input.termId &&
            config.scopeType === input.scopeType &&
            config.scopeKey === input.scopeKey,
        ) ?? null,
      ),
      findConfigById: jest.fn().mockImplementation(async (id: string) =>
        configs.find((config) => config.id === id) ?? null,
      ),
      createConfig: jest.fn().mockImplementation(async (data) => {
        const config: NonNullable<ConfigRecord> = {
          id: `config-${configs.length + 1}`,
          schoolId: String(data.schoolId),
          academicYearId: String(data.academicYearId),
          termId: String(data.termId),
          name: String(data.name),
          weekStartDay: Number(data.weekStartDay),
          activeDays: data.activeDays as number[],
          scopeType: data.scopeType as TimetableScopeType,
          scopeKey: String(data.scopeKey),
          gradeId: (data.gradeId as string | null | undefined) ?? null,
          sectionId: (data.sectionId as string | null | undefined) ?? null,
          classroomId: (data.classroomId as string | null | undefined) ?? null,
          status: data.status as TimetableConfigStatus,
          createdAt: now,
          updatedAt: now,
        };
        configs.push(config);
        return config;
      }),
      updateConfig: jest.fn().mockImplementation(async (id: string, data) => {
        const config = configs.find((item) => item.id === id);
        if (!config) throw new Error('missing config');
        Object.assign(config, data, { updatedAt: now });
        return config;
      }),
      listPeriods: jest.fn().mockImplementation(async (configId: string) =>
        periods
          .filter((period) => period.timetableConfigId === configId)
          .sort((left, right) => left.periodIndex - right.periodIndex),
      ),
      findPeriodById: jest.fn().mockImplementation(async (id: string) =>
        periods.find((period) => period.id === id) ?? null,
      ),
      findPeriodByIndex: jest.fn().mockImplementation(async (input) =>
        periods.find(
          (period) =>
            period.timetableConfigId === input.timetableConfigId &&
            period.periodIndex === input.periodIndex,
        ) ?? null,
      ),
      createPeriod: jest.fn().mockImplementation(async (data) => {
        const period: NonNullable<PeriodRecord> = {
          id: `period-${periods.length + 1}`,
          schoolId: String(data.schoolId),
          timetableConfigId: String(data.timetableConfigId),
          periodIndex: Number(data.periodIndex),
          label: String(data.label),
          startTime: String(data.startTime),
          endTime: String(data.endTime),
          type: data.type as TimetablePeriodType,
          isInstructional: Boolean(data.isInstructional),
          createdAt: now,
          updatedAt: now,
        };
        periods.push(period);
        return period;
      }),
      updatePeriod: jest.fn().mockImplementation(async (id: string, data) => {
        const period = periods.find((item) => item.id === id);
        if (!period) throw new Error('missing period');
        Object.assign(period, data, { updatedAt: now });
        return period;
      }),
      deletePeriod: jest.fn().mockImplementation(async (id: string) => {
        const index = periods.findIndex((period) => period.id === id);
        if (index === -1) return { status: 'not_found' as const };
        if (entries.some((entry) => entry.periodId === id)) {
          return { status: 'in_use' as const, entryCount: 1 };
        }
        periods.splice(index, 1);
        return { status: 'deleted' as const };
      }),
      listEntriesForConfig: jest.fn().mockImplementation(async (configId: string) =>
        entries.filter((entry) => entry.timetableConfigId === configId),
      ),
      listPersistedConflicts: jest.fn().mockResolvedValue(conflicts),
    } as unknown as TimetableRepository;
  }

  function seedConfig(): NonNullable<ConfigRecord> {
    return {
      id: 'config-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      name: 'Term Timetable',
      weekStartDay: 0,
      activeDays: [0, 1, 2, 3, 4],
      scopeType: TimetableScopeType.TERM,
      scopeKey: 'term:term-1',
      gradeId: null,
      sectionId: null,
      classroomId: null,
      status: TimetableConfigStatus.DRAFT,
      createdAt: new Date('2026-05-22T10:00:00.000Z'),
      updatedAt: new Date('2026-05-22T10:00:00.000Z'),
    };
  }

  function seedPeriod(): NonNullable<PeriodRecord> {
    return {
      id: 'period-1',
      schoolId: 'school-1',
      timetableConfigId: 'config-1',
      periodIndex: 1,
      label: 'Period 1',
      startTime: '08:00',
      endTime: '08:45',
      type: TimetablePeriodType.CLASS,
      isInstructional: true,
      createdAt: new Date('2026-05-22T10:00:00.000Z'),
      updatedAt: new Date('2026-05-22T10:00:00.000Z'),
    };
  }

  function seedEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
    return {
      id: 'entry-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      timetableConfigId: 'config-1',
      periodId: 'period-1',
      dayOfWeek: 0,
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      subjectId: 'subject-1',
      teacherUserId: 'teacher-1',
      teacherSubjectAllocationId: 'allocation-1',
      roomId: null,
      notes: null,
      status: TimetableEntryStatus.DRAFT,
      period: seedPeriod(),
      ...overrides,
    };
  }

  it('upserts and gets a sanitized timetable config', async () => {
    const repository = createRepository();
    const upsert = new UpsertTimetableConfigUseCase(repository);
    const get = new GetTimetableConfigUseCase(repository);

    await withScope(async () => {
      const created = await upsert.execute({
        academicYearId: 'year-1',
        termId: 'term-1',
        name: ' Term Timetable ',
        activeDays: [4, 0, 0],
        weekStartDay: 0,
      });

      expect(created.data.name).toBe('Term Timetable');
      expect(created.data.activeDays).toEqual([0, 4]);
      expect(created.data.status).toBe('draft');
      expect(created.data).not.toHaveProperty('schoolId');
      expect(created.data).not.toHaveProperty('organizationId');

      const fetched = await get.execute({
        academicYearId: 'year-1',
        termId: 'term-1',
      });
      expect(fetched.data.id).toBe(created.data.id);
    });
  });

  it('rejects timetable writes for closed terms', async () => {
    const repository = createRepository({ termActive: false });
    const upsert = new UpsertTimetableConfigUseCase(repository);

    await withScope(async () => {
      await expect(
        upsert.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          name: 'Closed Term Timetable',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.closed_term',
      });
    });
  });

  it('rejects upsert updates to active timetable configs', async () => {
    const repository = createRepository({
      configs: [
        {
          ...seedConfig(),
          status: TimetableConfigStatus.ACTIVE,
        },
      ],
    });
    const upsert = new UpsertTimetableConfigUseCase(repository);

    await withScope(async () => {
      await expect(
        upsert.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          name: 'Locked Timetable',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
    });
  });

  it.each([TimetableConfigStatus.ACTIVE, TimetableConfigStatus.ARCHIVED])(
    'rejects %s status through config upsert',
    async (status) => {
      const repository = createRepository();
      const upsert = new UpsertTimetableConfigUseCase(repository);

      await withScope(async () => {
        await expect(
          upsert.execute({
            academicYearId: 'year-1',
            termId: 'term-1',
            name: 'Non-draft Timetable',
            status,
          }),
        ).rejects.toMatchObject({
          code: 'validation.failed',
          details: {
            field: 'status',
            status,
          },
        });
      });
    },
  );

  it('updates an existing draft timetable config through upsert', async () => {
    const repository = createRepository({ configs: [seedConfig()] });
    const upsert = new UpsertTimetableConfigUseCase(repository);

    await withScope(async () => {
      const updated = await upsert.execute({
        academicYearId: 'year-1',
        termId: 'term-1',
        name: ' Updated Timetable ',
        activeDays: [1, 2, 2],
        weekStartDay: 1,
        status: TimetableConfigStatus.DRAFT,
      });

      expect(updated.data).toMatchObject({
        id: 'config-1',
        name: 'Updated Timetable',
        activeDays: [1, 2],
        weekStartDay: 1,
        status: 'draft',
      });
    });
  });

  it('creates, lists, updates, and deletes periods', async () => {
    const repository = createRepository({ configs: [seedConfig()] });
    const create = new CreateTimetablePeriodUseCase(repository);
    const list = new ListTimetablePeriodsUseCase(repository);
    const update = new UpdateTimetablePeriodUseCase(repository);
    const remove = new DeleteTimetablePeriodUseCase(repository);

    await withScope(async () => {
      const created = await create.execute({
        timetableConfigId: 'config-1',
        index: 1,
        label: 'Period 1',
        startTime: '08:00',
        endTime: '08:45',
      });
      expect(created.index).toBe(1);
      expect(created).not.toHaveProperty('schoolId');

      const listed = await list.execute({ timetableConfigId: 'config-1' });
      expect(listed.items).toHaveLength(1);

      const updated = await update.execute(created.id, {
        label: 'Period One',
        endTime: '08:50',
      });
      expect(updated.label).toBe('Period One');
      expect(updated.endTime).toBe('08:50');

      await expect(remove.execute(created.id)).resolves.toEqual({ ok: true });
      await expect(list.execute({ timetableConfigId: 'config-1' })).resolves.toEqual({
        items: [],
      });
    });
  });

  it('rejects duplicate index, invalid time, and overlapping periods', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
    });
    const create = new CreateTimetablePeriodUseCase(repository);

    await withScope(async () => {
      await expect(
        create.execute({
          timetableConfigId: 'config-1',
          index: 1,
          label: 'Duplicate',
          startTime: '09:00',
          endTime: '09:45',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.period_index_taken',
      });

      await expect(
        create.execute({
          timetableConfigId: 'config-1',
          index: 2,
          label: 'Invalid',
          startTime: '10:00',
          endTime: '10:00',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.invalid_time_range',
      });

      await expect(
        create.execute({
          timetableConfigId: 'config-1',
          index: 2,
          label: 'Overlap',
          startTime: '08:30',
          endTime: '09:00',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.period_overlap',
      });
    });
  });

  it('returns computed conflicts for duplicate teacher slots', async () => {
    const period = seedPeriod();
    const entries: EntryRecord[] = [
      seedEntry({
        id: 'entry-1',
        period,
      }),
      seedEntry({
        id: 'entry-2',
        sectionId: 'section-2',
        classroomId: 'classroom-2',
        subjectId: 'subject-2',
        teacherSubjectAllocationId: 'allocation-2',
        status: TimetableEntryStatus.ACTIVE,
        period,
      }),
    ];
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [period],
      entries,
    });
    const conflicts = new ListTimetableConflictsUseCase(repository);

    await withScope(async () => {
      const response = await conflicts.execute({ timetableConfigId: 'config-1' });
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toMatchObject({
        type: 'teacher',
        severity: TimetableConflictSeverity.BLOCKING.toLowerCase(),
        status: TimetableConflictStatus.OPEN.toLowerCase(),
        teacherUserId: 'teacher-1',
      });
      expect(response.items[0]).not.toHaveProperty('schoolId');
      expect(response.items[0]).not.toHaveProperty('organizationId');
    });
  });

  it('ignores cancelled entries when computing classroom teacher and room conflicts', () => {
    const period = seedPeriod();
    const entries: EntryRecord[] = [
      seedEntry({
        id: 'entry-1',
        roomId: 'room-1',
        period,
      }),
      seedEntry({
        id: 'entry-2',
        teacherSubjectAllocationId: 'allocation-2',
        roomId: 'room-1',
        status: TimetableEntryStatus.CANCELLED,
        period,
      }),
    ];

    expect(computeTimetableConflicts(entries)).toEqual([]);
  });

  it('keeps timetable repository reads on scoped Prisma and avoids platform bypass', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      scoped: {
        timetableConfig: { findFirst },
      },
    };
    const repository = new TimetableRepository(prisma as never);

    await repository.findConfigById('config-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'config-1' } }),
    );

    const source = readFileSync(__dirname + '/../infrastructure/timetable.repository.ts', 'utf8');
    expect(source).not.toContain('platformBypass');
    expect(source).not.toContain('withBypassSchoolScope');
  });

  it('uses cataloged domain exception codes for validation failures', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
    });
    const create = new CreateTimetablePeriodUseCase(repository);

    await withScope(async () => {
      try {
        await create.execute({
          timetableConfigId: 'config-1',
          index: 2,
          label: 'Bad',
          startTime: '11:00',
          endTime: '10:00',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        expect((error as DomainException).code).toBe(
          'academics.timetable.invalid_time_range',
        );
      }
    });
  });
});
