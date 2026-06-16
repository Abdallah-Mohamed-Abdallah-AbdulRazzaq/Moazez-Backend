import { readFileSync } from 'node:fs';
import {
  TimetableConfigStatus,
  TimetableConflictSeverity,
  TimetableConflictStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
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
import { BulkSaveTimetableEntriesUseCase } from '../application/bulk-save-timetable-entries.use-case';
import { CheckTimetableConflictsUseCase } from '../application/check-timetable-conflicts.use-case';
import { CreateTimetableEntryUseCase } from '../application/create-timetable-entry.use-case';
import { CreateTimetablePeriodUseCase } from '../application/create-timetable-period.use-case';
import { DeleteTimetableEntryUseCase } from '../application/delete-timetable-entry.use-case';
import { DeleteTimetablePeriodUseCase } from '../application/delete-timetable-period.use-case';
import { GetTimetableDashboardAllUseCase } from '../application/get-timetable-dashboard-all.use-case';
import { GetTimetableConfigUseCase } from '../application/get-timetable-config.use-case';
import { GetTimetableEntryUseCase } from '../application/get-timetable-entry.use-case';
import { GetTimetablePreviewUseCase } from '../application/get-timetable-preview.use-case';
import { GetTimetablePublicationUseCase } from '../application/get-timetable-publication.use-case';
import { ListTimetableConflictsUseCase } from '../application/list-timetable-conflicts.use-case';
import { ListTimetableEntriesUseCase } from '../application/list-timetable-entries.use-case';
import { ListTimetablePeriodsUseCase } from '../application/list-timetable-periods.use-case';
import { PublishTimetableUseCase } from '../application/publish-timetable.use-case';
import { deriveTimetableAttendanceCompatibilityKey } from '../application/timetable-attendance-compatibility.service';
import { UnpublishTimetableUseCase } from '../application/unpublish-timetable.use-case';
import { UpdateTimetableEntryUseCase } from '../application/update-timetable-entry.use-case';
import { UpdateTimetablePeriodUseCase } from '../application/update-timetable-period.use-case';
import { UpsertTimetableConfigUseCase } from '../application/upsert-timetable-config.use-case';
import { ValidateTimetableUseCase } from '../application/validate-timetable.use-case';
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
type PublicationRecord = NonNullable<
  Awaited<ReturnType<TimetableRepository['findLatestPublicationByConfigId']>>
>;
type ClassroomRecord = NonNullable<
  Awaited<ReturnType<TimetableRepository['findClassroomById']>>
>;
type RoomRecord = NonNullable<
  Awaited<ReturnType<TimetableRepository['findRoomById']>>
>;
type AllocationRecord = NonNullable<
  Awaited<ReturnType<TimetableRepository['findTeacherAllocationById']>>
>;
type GradeRecord = NonNullable<
  Awaited<ReturnType<TimetableRepository['findGradeById']>>
>;
type SubjectAllocationRecord = NonNullable<
  Awaited<ReturnType<TimetableRepository['findSubjectAllocationByKey']>>
>;

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
    publications?: PublicationRecord[];
    classrooms?: ClassroomRecord[];
    rooms?: RoomRecord[];
    allocations?: AllocationRecord[];
    grades?: GradeRecord[];
    subjectAllocations?: SubjectAllocationRecord[];
    termActive?: boolean;
  }): TimetableRepository {
    const configs = [...(seed?.configs ?? [])];
    const periods = [...(seed?.periods ?? [])];
    const entries = [...(seed?.entries ?? [])];
    const publications = [...(seed?.publications ?? [])];
    const classrooms = seed?.classrooms ?? [seedClassroom()];
    const rooms = seed?.rooms ?? [seedRoom()];
    const allocations = seed?.allocations ?? [seedAllocation()];
    const grades = seed?.grades ?? [seedGrade()];
    const subjectAllocations = seed?.subjectAllocations ?? [
      seedSubjectAllocation(),
    ];
    const subjects = [
      { id: 'subject-1', nameAr: 'Math', nameEn: 'Math', code: 'MATH' },
      { id: 'subject-2', nameAr: 'Science', nameEn: 'Science', code: 'SCI' },
    ];
    const conflicts: never[] = [];
    const now = new Date('2026-05-22T10:00:00.000Z');

    function periodSummary(periodId: string): EntryRecord['period'] {
      const period =
        periods.find((item) => item.id === periodId) ?? seedPeriod();
      return {
        id: period.id,
        periodIndex: period.periodIndex,
        label: period.label,
        startTime: period.startTime,
        endTime: period.endTime,
      };
    }

    function classroomSummary(classroomId: string): EntryRecord['classroom'] {
      const classroom =
        classrooms.find((item) => item.id === classroomId) ?? seedClassroom();
      return {
        id: classroom.id,
        nameAr: classroom.nameAr,
        nameEn: classroom.nameEn,
      };
    }

    function subjectSummary(subjectId: string): EntryRecord['subject'] {
      return (
        subjects.find((item) => item.id === subjectId) ?? {
          id: subjectId,
          nameAr: 'Subject',
          nameEn: 'Subject',
          code: null,
        }
      );
    }

    function roomSummary(roomId: string | null): EntryRecord['room'] {
      if (!roomId) return null;
      const room = rooms.find((item) => item.id === roomId) ?? seedRoom();
      return {
        id: room.id,
        nameAr: room.nameAr,
        nameEn: room.nameEn,
      };
    }

    function buildEntry(
      data: Omit<
        EntryRecord,
        'period' | 'classroom' | 'subject' | 'teacherUser' | 'room'
      >,
    ): EntryRecord {
      return {
        ...data,
        period: periodSummary(data.periodId),
        classroom: classroomSummary(data.classroomId),
        subject: subjectSummary(data.subjectId),
        teacherUser: {
          id: data.teacherUserId,
          firstName: 'Teacher',
          lastName: data.teacherUserId.endsWith('2') ? 'Two' : 'One',
        },
        room: roomSummary(data.roomId),
      };
    }

    return {
      findAcademicYearById: jest
        .fn()
        .mockImplementation(async (id: string) =>
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
      findGradeById: jest
        .fn()
        .mockImplementation(
          async (id: string) => grades.find((grade) => grade.id === id) ?? null,
        ),
      findSectionById: jest.fn().mockResolvedValue(null),
      findClassroomById: jest
        .fn()
        .mockImplementation(
          async (id: string) =>
            classrooms.find((classroom) => classroom.id === id) ?? null,
        ),
      findRoomById: jest
        .fn()
        .mockImplementation(
          async (id: string) => rooms.find((room) => room.id === id) ?? null,
        ),
      findTeacherAllocationById: jest
        .fn()
        .mockImplementation(
          async (id: string) =>
            allocations.find((allocation) => allocation.id === id) ?? null,
        ),
      findSubjectAllocationByKey: jest.fn().mockImplementation(async (input) =>
        subjectAllocations.find(
          (row) =>
            row.termId === input.termId &&
            row.gradeId === input.gradeId &&
            row.subjectId === input.subjectId,
        ) ?? null,
      ),
      findSubjectAllocationsByKeys: jest
        .fn()
        .mockImplementation(async (termId: string, keys) =>
          subjectAllocations.filter(
            (row) =>
              row.termId === termId &&
              keys.some(
                (key) =>
                  key.gradeId === row.gradeId &&
                  key.subjectId === row.subjectId,
              ),
          ),
        ),
      listSubjectAllocationsForTerm: jest.fn().mockImplementation(async (filters) =>
        subjectAllocations.filter(
          (row) =>
            row.termId === filters.termId &&
            (filters.gradeId ? row.gradeId === filters.gradeId : true),
        ),
      ),
      findConfigByScope: jest
        .fn()
        .mockImplementation(
          async (input) =>
            configs.find(
              (config) =>
                config.academicYearId === input.academicYearId &&
                config.termId === input.termId &&
                config.scopeType === input.scopeType &&
                config.scopeKey === input.scopeKey,
            ) ?? null,
        ),
      findConfigById: jest
        .fn()
        .mockImplementation(
          async (id: string) =>
            configs.find((config) => config.id === id) ?? null,
        ),
      listConfigsByTerm: jest
        .fn()
        .mockImplementation(async (termId: string) =>
          configs.filter((config) => config.termId === termId),
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
      listPeriods: jest
        .fn()
        .mockImplementation(async (configId: string) =>
          periods
            .filter((period) => period.timetableConfigId === configId)
            .sort((left, right) => left.periodIndex - right.periodIndex),
        ),
      listPeriodsByConfigIds: jest
        .fn()
        .mockImplementation(async (configIds: string[]) =>
          periods
            .filter((period) => configIds.includes(period.timetableConfigId))
            .sort((left, right) => left.periodIndex - right.periodIndex),
        ),
      findPeriodById: jest
        .fn()
        .mockImplementation(
          async (id: string) =>
            periods.find((period) => period.id === id) ?? null,
        ),
      findPeriodByIndex: jest
        .fn()
        .mockImplementation(
          async (input) =>
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
      listEntriesForConfig: jest
        .fn()
        .mockImplementation(async (configId: string) =>
          entries.filter((entry) => entry.timetableConfigId === configId),
        ),
      listEntries: jest.fn().mockImplementation(async (filters) =>
        entries
          .filter(
            (entry) => entry.timetableConfigId === filters.timetableConfigId,
          )
          .filter((entry) =>
            filters.classroomId
              ? entry.classroomId === filters.classroomId
              : true,
          )
          .filter((entry) =>
            filters.teacherUserId
              ? entry.teacherUserId === filters.teacherUserId
              : true,
          )
          .filter((entry) =>
            filters.subjectId ? entry.subjectId === filters.subjectId : true,
          )
          .filter((entry) =>
            filters.roomId ? entry.roomId === filters.roomId : true,
          )
          .filter((entry) =>
            filters.dayOfWeek !== undefined
              ? entry.dayOfWeek === filters.dayOfWeek
              : true,
          )
          .filter((entry) =>
            filters.status ? entry.status === filters.status : true,
          ),
      ),
      listEntriesByTerm: jest.fn().mockImplementation(async (filters) =>
        entries
          .filter((entry) => entry.termId === filters.termId)
          .filter((entry) =>
            filters.gradeId ? entry.gradeId === filters.gradeId : true,
          )
          .filter((entry) =>
            filters.classroomId
              ? entry.classroomId === filters.classroomId
              : true,
          ),
      ),
      listTeacherAllocationsByTerm: jest.fn().mockImplementation(async (filters) =>
        allocations.filter((allocation) => {
          const classroom = classrooms.find(
            (item) => item.id === allocation.classroomId,
          );
          return (
            allocation.termId === filters.termId &&
            (filters.classroomId
              ? allocation.classroomId === filters.classroomId
              : true) &&
            (filters.gradeId
              ? classroom?.section.gradeId === filters.gradeId
              : true)
          );
        }),
      ),
      listClassroomsByGradeIds: jest
        .fn()
        .mockImplementation(async (gradeIds: string[]) =>
          classrooms.filter((classroom) =>
            gradeIds.includes(classroom.section.gradeId),
          ),
        ),
      listGradesByIds: jest
        .fn()
        .mockImplementation(async (gradeIds: string[]) =>
          grades.filter((grade) => gradeIds.includes(grade.id)),
        ),
      findEntryById: jest
        .fn()
        .mockImplementation(
          async (id: string) =>
            entries.find((entry) => entry.id === id) ?? null,
        ),
      listEntriesForConflictWindow: jest
        .fn()
        .mockImplementation(async (input) =>
          entries.filter(
            (entry) =>
              entry.timetableConfigId === input.timetableConfigId &&
              entry.periodId === input.periodId &&
              entry.dayOfWeek === input.dayOfWeek &&
              entry.status !== TimetableEntryStatus.CANCELLED &&
              entry.id !== input.excludeEntryId,
          ),
        ),
      createEntry: jest.fn().mockImplementation(async (data) => {
        const entry = buildEntry({
          id: `entry-${entries.length + 1}`,
          schoolId: String(data.schoolId),
          academicYearId: String(data.academicYearId),
          termId: String(data.termId),
          timetableConfigId: String(data.timetableConfigId),
          periodId: String(data.periodId),
          dayOfWeek: Number(data.dayOfWeek),
          gradeId: String(data.gradeId),
          sectionId: String(data.sectionId),
          classroomId: String(data.classroomId),
          subjectId: String(data.subjectId),
          teacherUserId: String(data.teacherUserId),
          teacherSubjectAllocationId: String(data.teacherSubjectAllocationId),
          roomId: (data.roomId as string | null | undefined) ?? null,
          notes: (data.notes as string | null | undefined) ?? null,
          status: data.status as TimetableEntryStatus,
          createdAt: now,
          updatedAt: now,
        });
        entries.push(entry);
        return entry;
      }),
      updateEntry: jest.fn().mockImplementation(async (id: string, data) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index === -1) throw new Error('missing entry');
        const current = entries[index];
        const updated = buildEntry({
          id: current.id,
          schoolId: current.schoolId,
          academicYearId:
            (data.academicYearId as string) ?? current.academicYearId,
          termId: (data.termId as string) ?? current.termId,
          timetableConfigId:
            (data.timetableConfigId as string) ?? current.timetableConfigId,
          periodId: (data.periodId as string) ?? current.periodId,
          dayOfWeek: (data.dayOfWeek as number) ?? current.dayOfWeek,
          gradeId: (data.gradeId as string) ?? current.gradeId,
          sectionId: (data.sectionId as string) ?? current.sectionId,
          classroomId: (data.classroomId as string) ?? current.classroomId,
          subjectId: (data.subjectId as string) ?? current.subjectId,
          teacherUserId:
            (data.teacherUserId as string) ?? current.teacherUserId,
          teacherSubjectAllocationId:
            (data.teacherSubjectAllocationId as string) ??
            current.teacherSubjectAllocationId,
          roomId: Object.prototype.hasOwnProperty.call(data, 'roomId')
            ? (data.roomId as string | null)
            : current.roomId,
          notes: Object.prototype.hasOwnProperty.call(data, 'notes')
            ? (data.notes as string | null)
            : current.notes,
          status: current.status,
          createdAt: current.createdAt,
          updatedAt: now,
        });
        entries[index] = updated;
        return updated;
      }),
      deleteEntry: jest.fn().mockImplementation(async (id: string) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index === -1) return { status: 'not_found' as const };
        entries.splice(index, 1);
        return { status: 'deleted' as const };
      }),
      bulkUpsertEntries: jest.fn().mockImplementation(async (bulkEntries) => {
        const changed: EntryRecord[] = [];
        let createdCount = 0;
        let updatedCount = 0;

        for (const bulkEntry of bulkEntries) {
          const existingIndex = entries.findIndex(
            (entry) =>
              entry.termId === bulkEntry.termId &&
              entry.classroomId === bulkEntry.classroomId &&
              entry.dayOfWeek === bulkEntry.dayOfWeek &&
              entry.periodId === bulkEntry.periodId,
          );
          const entryData = {
            schoolId: bulkEntry.schoolId,
            academicYearId: bulkEntry.academicYearId,
            termId: bulkEntry.termId,
            timetableConfigId: bulkEntry.timetableConfigId,
            periodId: bulkEntry.periodId,
            dayOfWeek: bulkEntry.dayOfWeek,
            gradeId: bulkEntry.gradeId,
            sectionId: bulkEntry.sectionId,
            classroomId: bulkEntry.classroomId,
            subjectId: bulkEntry.subjectId,
            teacherUserId: bulkEntry.teacherUserId,
            teacherSubjectAllocationId: bulkEntry.teacherSubjectAllocationId,
            roomId: bulkEntry.roomId,
            notes: null,
            status: TimetableEntryStatus.DRAFT,
          };

          if (existingIndex >= 0) {
            const updated = buildEntry({
              ...entries[existingIndex],
              ...entryData,
              updatedAt: now,
            });
            entries[existingIndex] = updated;
            changed.push(updated);
            updatedCount += 1;
            continue;
          }

          const created = buildEntry({
            id: `entry-${entries.length + 1}`,
            ...entryData,
            createdAt: now,
            updatedAt: now,
          });
          entries.push(created);
          changed.push(created);
          createdCount += 1;
        }

        return { entries: changed, createdCount, updatedCount };
      }),
      listPersistedConflicts: jest.fn().mockResolvedValue(conflicts),
      findLatestPublicationByConfigId: jest
        .fn()
        .mockImplementation(async (configId: string) => {
          const matches = publications
            .filter(
              (publication) => publication.timetableConfigId === configId,
            )
            .sort((left, right) => right.revision - left.revision);

          return matches[0] ?? null;
        }),
      findLatestPublicationsByConfigIds: jest
        .fn()
        .mockImplementation(async (configIds: string[]) =>
          publications.filter((publication) =>
            configIds.includes(publication.timetableConfigId),
          ),
        ),
      publishConfig: jest.fn().mockImplementation(async (input) => {
        const config = configs.find((item) => item.id === input.config.id);
        if (!config) throw new Error('missing config');
        config.status = TimetableConfigStatus.ACTIVE;
        config.updatedAt = input.publishedAt;

        const activatedEntries = entries.filter(
          (entry) =>
            entry.timetableConfigId === config.id &&
            entry.status === TimetableEntryStatus.DRAFT,
        );
        for (const entry of activatedEntries) {
          entry.status = TimetableEntryStatus.ACTIVE;
          entry.updatedAt = input.publishedAt;
        }

        const publication: PublicationRecord = {
          id: `publication-${publications.length + 1}`,
          schoolId: config.schoolId,
          academicYearId: config.academicYearId,
          termId: config.termId,
          timetableConfigId: config.id,
          status: TimetablePublicationStatus.PUBLISHED,
          publishedAt: input.publishedAt,
          publishedByUserId: input.publishedByUserId,
          revision: input.revision,
          createdAt: input.publishedAt,
          updatedAt: input.publishedAt,
        };
        publications.push(publication);

        return {
          config,
          publication,
          activatedEntriesCount: activatedEntries.length,
        };
      }),
      unpublishConfigs: jest
        .fn()
        .mockImplementation(async (configIds: string[]) => {
          let unpublishedCount = 0;
          let entriesReturnedToDraft = 0;

          for (const publication of publications) {
            if (
              configIds.includes(publication.timetableConfigId) &&
              publication.status === TimetablePublicationStatus.PUBLISHED
            ) {
              publication.status = TimetablePublicationStatus.SUPERSEDED;
              publication.updatedAt = now;
              unpublishedCount += 1;
            }
          }
          for (const config of configs) {
            if (
              configIds.includes(config.id) &&
              config.status === TimetableConfigStatus.ACTIVE
            ) {
              config.status = TimetableConfigStatus.DRAFT;
              config.updatedAt = now;
            }
          }
          for (const entry of entries) {
            if (
              configIds.includes(entry.timetableConfigId) &&
              entry.status === TimetableEntryStatus.ACTIVE
            ) {
              entry.status = TimetableEntryStatus.DRAFT;
              entry.updatedAt = now;
              entriesReturnedToDraft += 1;
            }
          }

          return { unpublishedCount, entriesReturnedToDraft };
        }),
    } as unknown as TimetableRepository;
  }

  function seedConfig(
    overrides: Partial<NonNullable<ConfigRecord>> = {},
  ): NonNullable<ConfigRecord> {
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
      ...overrides,
    };
  }

  function seedPeriod(
    overrides: Partial<NonNullable<PeriodRecord>> = {},
  ): NonNullable<PeriodRecord> {
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
      ...overrides,
    };
  }

  function seedClassroom(
    overrides: Partial<ClassroomRecord> = {},
  ): ClassroomRecord {
    return {
      id: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      nameAr: 'Classroom 1',
      nameEn: 'Classroom 1',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
      },
      ...overrides,
    };
  }

  function seedGrade(overrides: Partial<GradeRecord> = {}): GradeRecord {
    return {
      id: 'grade-1',
      schoolId: 'school-1',
      nameAr: 'Grade 1',
      nameEn: 'Grade 1',
      ...overrides,
    };
  }

  function seedSubjectAllocation(
    overrides: Partial<SubjectAllocationRecord> = {},
  ): SubjectAllocationRecord {
    const gradeId = overrides.gradeId ?? 'grade-1';
    const subjectId = overrides.subjectId ?? 'subject-1';

    return {
      id: `subject-allocation-${gradeId}-${subjectId}`,
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      gradeId,
      subjectId,
      weeklyHours: 1,
      grade: {
        id: gradeId,
        nameAr: 'Grade 1',
        nameEn: 'Grade 1',
      },
      subject: {
        id: subjectId,
        nameAr: subjectId === 'subject-2' ? 'Science' : 'Math',
        nameEn: subjectId === 'subject-2' ? 'Science' : 'Math',
        code: subjectId === 'subject-2' ? 'SCI' : 'MATH',
        color: null,
      },
      ...overrides,
    };
  }

  function seedRoom(overrides: Partial<RoomRecord> = {}): RoomRecord {
    return {
      id: 'room-1',
      schoolId: 'school-1',
      nameAr: 'Room 1',
      nameEn: 'Room 1',
      ...overrides,
    };
  }

  function seedAllocation(
    overrides: Partial<AllocationRecord> = {},
  ): AllocationRecord {
    return {
      id: 'allocation-1',
      schoolId: 'school-1',
      teacherUserId: 'teacher-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
      termId: 'term-1',
      ...overrides,
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
      classroom: {
        id: 'classroom-1',
        nameAr: 'Classroom 1',
        nameEn: 'Classroom 1',
      },
      subject: {
        id: 'subject-1',
        nameAr: 'Math',
        nameEn: 'Math',
        code: 'MATH',
      },
      teacherUser: {
        id: 'teacher-1',
        firstName: 'Teacher',
        lastName: 'One',
      },
      room: null,
      createdAt: new Date('2026-05-22T10:00:00.000Z'),
      updatedAt: new Date('2026-05-22T10:00:00.000Z'),
      ...overrides,
    };
  }

  function seedPublication(
    overrides: Partial<PublicationRecord> = {},
  ): PublicationRecord {
    return {
      id: 'publication-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      timetableConfigId: 'config-1',
      status: TimetablePublicationStatus.PUBLISHED,
      publishedAt: new Date('2026-05-22T10:00:00.000Z'),
      publishedByUserId: 'user-1',
      revision: 1,
      createdAt: new Date('2026-05-22T10:00:00.000Z'),
      updatedAt: new Date('2026-05-22T10:00:00.000Z'),
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
      await expect(
        list.execute({ timetableConfigId: 'config-1' }),
      ).resolves.toEqual({
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

  it('creates, lists, gets, updates, and deletes timetable entries with derived fields', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
    });
    const create = new CreateTimetableEntryUseCase(repository);
    const list = new ListTimetableEntriesUseCase(repository);
    const get = new GetTimetableEntryUseCase(repository);
    const update = new UpdateTimetableEntryUseCase(repository);
    const remove = new DeleteTimetableEntryUseCase(repository);

    await withScope(async () => {
      const created = await create.execute({
        timetableConfigId: 'config-1',
        periodId: 'period-1',
        dayOfWeek: 0,
        classroomId: 'classroom-1',
        teacherSubjectAllocationId: 'allocation-1',
        roomId: 'room-1',
        notes: ' Math lab ',
      });

      expect(created).toMatchObject({
        timetableConfigId: 'config-1',
        periodId: 'period-1',
        dayOfWeek: 0,
        teacherSubjectAllocationId: 'allocation-1',
        notes: 'Math lab',
        status: 'draft',
        classroom: { id: 'classroom-1' },
        subject: { id: 'subject-1' },
        teacher: { userId: 'teacher-1', fullName: 'Teacher One' },
        room: { id: 'room-1' },
      });
      expect(created).not.toHaveProperty('schoolId');
      expect(created).not.toHaveProperty('organizationId');
      expect(repository.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          academicYearId: 'year-1',
          termId: 'term-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          subjectId: 'subject-1',
          teacherUserId: 'teacher-1',
          status: TimetableEntryStatus.DRAFT,
        }),
      );

      await expect(
        list.execute({ timetableConfigId: 'config-1' }),
      ).resolves.toEqual({
        items: [created],
      });
      await expect(get.execute(created.id)).resolves.toMatchObject({
        id: created.id,
      });

      const updated = await update.execute(created.id, {
        notes: 'Updated note',
        roomId: null,
      });
      expect(updated.notes).toBe('Updated note');
      expect(updated.room).toBeNull();

      await expect(remove.execute(created.id)).resolves.toEqual({ ok: true });
      await expect(
        list.execute({ timetableConfigId: 'config-1' }),
      ).resolves.toEqual({
        items: [],
      });
    });
  });

  it('rejects timetable entry update and delete when entry is not draft', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
      entries: [seedEntry({ status: TimetableEntryStatus.ACTIVE })],
    });
    const update = new UpdateTimetableEntryUseCase(repository);
    const remove = new DeleteTimetableEntryUseCase(repository);

    await withScope(async () => {
      await expect(
        update.execute('entry-1', { notes: 'Cannot change active entry' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.entry_not_mutable',
      });
      await expect(remove.execute('entry-1')).rejects.toMatchObject({
        code: 'academics.timetable.entry_not_mutable',
      });
      expect(repository.updateEntry).not.toHaveBeenCalled();
      expect(repository.deleteEntry).not.toHaveBeenCalled();
    });
  });

  it('rejects timetable entry writes for missing configs, foreign periods, and inactive days', async () => {
    const createMissingConfig = new CreateTimetableEntryUseCase(
      createRepository(),
    );
    const createBadPeriod = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig()],
        periods: [
          seedPeriod({
            id: 'period-foreign',
            timetableConfigId: 'config-foreign',
          }),
        ],
      }),
    );
    const createInactiveDay = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig({ activeDays: [1, 2] })],
        periods: [seedPeriod()],
      }),
    );

    await withScope(async () => {
      const command = {
        timetableConfigId: 'config-1',
        periodId: 'period-1',
        dayOfWeek: 0,
        classroomId: 'classroom-1',
        teacherSubjectAllocationId: 'allocation-1',
      };

      await expect(createMissingConfig.execute(command)).rejects.toMatchObject({
        code: 'academics.timetable.config_not_found',
      });
      await expect(
        createBadPeriod.execute({ ...command, periodId: 'period-foreign' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.period_not_in_config',
      });
      await expect(createInactiveDay.execute(command)).rejects.toMatchObject({
        code: 'academics.timetable.invalid_day',
      });
    });
  });

  it('separates missing timetable entry related ids from semantic mismatches', async () => {
    const scopedConfig = {
      ...seedConfig(),
      scopeType: TimetableScopeType.GRADE,
      scopeKey: 'grade:grade-2',
      gradeId: 'grade-2',
    };
    const createMissingClassroom = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        classrooms: [],
      }),
    );
    const createOutsideScope = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [scopedConfig],
        periods: [seedPeriod()],
      }),
    );
    const createMissingAllocation = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        allocations: [],
      }),
    );
    const createSubjectMismatch = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
      }),
    );
    const createTermMismatch = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        allocations: [
          seedAllocation({
            id: 'allocation-term-2',
            termId: 'term-2',
          }),
        ],
      }),
    );
    const createClassroomMismatch = new CreateTimetableEntryUseCase(
      createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        allocations: [
          seedAllocation({
            id: 'allocation-classroom-2',
            classroomId: 'classroom-2',
          }),
        ],
      }),
    );

    await withScope(async () => {
      const command = {
        timetableConfigId: 'config-1',
        periodId: 'period-1',
        dayOfWeek: 0,
        classroomId: 'classroom-1',
        teacherSubjectAllocationId: 'allocation-1',
      };

      await expect(
        createMissingClassroom.execute({
          ...command,
          classroomId: 'classroom-missing',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.classroom_not_found',
      });
      await expect(createOutsideScope.execute(command)).rejects.toMatchObject({
        code: 'academics.timetable.classroom_scope_mismatch',
      });
      await expect(
        createMissingAllocation.execute({
          ...command,
          teacherSubjectAllocationId: 'allocation-missing',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.allocation_not_found',
      });
      await expect(
        createSubjectMismatch.execute({
          ...command,
          subjectId: 'subject-2',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.allocation_mismatch',
      });
      await expect(
        createTermMismatch.execute({
          ...command,
          teacherSubjectAllocationId: 'allocation-term-2',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.allocation_mismatch',
      });
      await expect(
        createClassroomMismatch.execute({
          ...command,
          teacherSubjectAllocationId: 'allocation-classroom-2',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.allocation_mismatch',
      });
    });
  });

  it('rejects missing rooms and blocking classroom teacher and room conflicts', async () => {
    await withScope(async () => {
      const missingRoomRepository = createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
      });
      await expect(
        new CreateTimetableEntryUseCase(missingRoomRepository).execute({
          timetableConfigId: 'config-1',
          periodId: 'period-1',
          dayOfWeek: 0,
          classroomId: 'classroom-1',
          teacherSubjectAllocationId: 'allocation-1',
          roomId: 'room-missing',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.room_not_found',
      });

      const classroomConflictRepository = createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        entries: [seedEntry()],
      });
      await expect(
        new CreateTimetableEntryUseCase(classroomConflictRepository).execute({
          timetableConfigId: 'config-1',
          periodId: 'period-1',
          dayOfWeek: 0,
          classroomId: 'classroom-1',
          teacherSubjectAllocationId: 'allocation-1',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.entry_conflict',
      });

      const teacherConflictRepository = createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        classrooms: [
          seedClassroom(),
          seedClassroom({
            id: 'classroom-2',
            sectionId: 'section-2',
            section: { id: 'section-2', gradeId: 'grade-1' },
          }),
        ],
        entries: [
          seedEntry({
            id: 'entry-teacher-conflict',
            classroomId: 'classroom-2',
            teacherSubjectAllocationId: 'allocation-2',
          }),
        ],
      });
      await expect(
        new CreateTimetableEntryUseCase(teacherConflictRepository).execute({
          timetableConfigId: 'config-1',
          periodId: 'period-1',
          dayOfWeek: 0,
          classroomId: 'classroom-1',
          teacherSubjectAllocationId: 'allocation-1',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.teacher_conflict',
      });

      const roomConflictRepository = createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        classrooms: [
          seedClassroom(),
          seedClassroom({
            id: 'classroom-2',
            sectionId: 'section-2',
            section: { id: 'section-2', gradeId: 'grade-1' },
          }),
        ],
        entries: [
          seedEntry({
            id: 'entry-room-conflict',
            classroomId: 'classroom-2',
            teacherUserId: 'teacher-2',
            teacherSubjectAllocationId: 'allocation-2',
            roomId: 'room-1',
            room: { id: 'room-1', nameAr: 'Room 1', nameEn: 'Room 1' },
          }),
        ],
      });
      await expect(
        new CreateTimetableEntryUseCase(roomConflictRepository).execute({
          timetableConfigId: 'config-1',
          periodId: 'period-1',
          dayOfWeek: 0,
          classroomId: 'classroom-1',
          teacherSubjectAllocationId: 'allocation-1',
          roomId: 'room-1',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.room_conflict',
      });
    });
  });

  it('ignores cancelled timetable entries when blocking new entries', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
      entries: [
        seedEntry({
          status: TimetableEntryStatus.CANCELLED,
          roomId: 'room-1',
          room: { id: 'room-1', nameAr: 'Room 1', nameEn: 'Room 1' },
        }),
      ],
    });
    const create = new CreateTimetableEntryUseCase(repository);

    await withScope(async () => {
      await expect(
        create.execute({
          timetableConfigId: 'config-1',
          periodId: 'period-1',
          dayOfWeek: 0,
          classroomId: 'classroom-1',
          teacherSubjectAllocationId: 'allocation-1',
          roomId: 'room-1',
        }),
      ).resolves.toMatchObject({
        classroom: { id: 'classroom-1' },
        room: { id: 'room-1' },
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
      const response = await conflicts.execute({
        timetableConfigId: 'config-1',
      });
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toMatchObject({
        type: 'TEACHER',
        entryIds: ['entry-1', 'entry-2'],
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

  it('publishes a valid draft timetable and marks config and entries active', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
      entries: [seedEntry()],
    });
    const publish = new PublishTimetableUseCase(repository);
    const publication = new GetTimetablePublicationUseCase(repository);

    await withScope(async () => {
      const result = await publish.execute({ timetableConfigId: 'config-1' });

      expect(result).toMatchObject({
        timetableConfigId: 'config-1',
        status: 'published',
        revision: 1,
        publishedByUserId: 'user-1',
        canPublish: false,
        summary: {
          periodsCount: 1,
          instructionalPeriodsCount: 1,
          entriesCount: 1,
          conflictsCount: 0,
          scopeType: 'term',
          academicYearId: 'year-1',
          termId: 'term-1',
        },
      });
      expect(result.publishedAt).toBeTruthy();
      expect(result).not.toHaveProperty('schoolId');
      expect(result).not.toHaveProperty('organizationId');
      expect(repository.publishConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ id: 'config-1' }),
          revision: 1,
          publishedByUserId: 'user-1',
        }),
      );

      await expect(
        publication.execute({ timetableConfigId: 'config-1' }),
      ).resolves.toMatchObject({
        status: 'published',
        revision: 1,
        canPublish: false,
      });
    });
  });

  it('blocks publish when there are no instructional periods', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [
        seedPeriod({
          type: TimetablePeriodType.BREAK,
          isInstructional: false,
        }),
      ],
      entries: [seedEntry()],
    });
    const publish = new PublishTimetableUseCase(repository);

    await withScope(async () => {
      await expect(
        publish.execute({ timetableConfigId: 'config-1' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.no_periods',
      });
      expect(repository.publishConfig).not.toHaveBeenCalled();
    });
  });

  it('blocks publish when there are no schedulable entries', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
      entries: [seedEntry({ status: TimetableEntryStatus.CANCELLED })],
    });
    const publish = new PublishTimetableUseCase(repository);

    await withScope(async () => {
      await expect(
        publish.execute({ timetableConfigId: 'config-1' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.no_entries',
      });
      expect(repository.publishConfig).not.toHaveBeenCalled();
    });
  });

  it('blocks publish when current computed conflicts exist', async () => {
    const period = seedPeriod();
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [period],
      classrooms: [
        seedClassroom(),
        seedClassroom({
          id: 'classroom-2',
          sectionId: 'section-2',
          section: { id: 'section-2', gradeId: 'grade-1' },
        }),
      ],
      allocations: [
        seedAllocation(),
        seedAllocation({
          id: 'allocation-2',
          teacherUserId: 'teacher-1',
          subjectId: 'subject-2',
          classroomId: 'classroom-2',
        }),
      ],
      entries: [
        seedEntry({ id: 'entry-1', period }),
        seedEntry({
          id: 'entry-2',
          period,
          sectionId: 'section-2',
          classroomId: 'classroom-2',
          subjectId: 'subject-2',
          teacherUserId: 'teacher-1',
          teacherSubjectAllocationId: 'allocation-2',
        }),
      ],
    });
    const publish = new PublishTimetableUseCase(repository);

    await withScope(async () => {
      await expect(
        publish.execute({ timetableConfigId: 'config-1' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.publish_blocked',
        details: {
          blockingReasons: expect.arrayContaining([
            expect.objectContaining({ code: 'conflicts' }),
          ]),
        },
      });
      expect(repository.publishConfig).not.toHaveBeenCalled();
    });
  });

  it('rejects publish for already active timetable configs', async () => {
    const repository = createRepository({
      configs: [seedConfig({ status: TimetableConfigStatus.ACTIVE })],
      periods: [seedPeriod()],
      entries: [seedEntry({ status: TimetableEntryStatus.ACTIVE })],
      publications: [seedPublication()],
    });
    const publish = new PublishTimetableUseCase(repository);

    await withScope(async () => {
      await expect(
        publish.execute({ timetableConfigId: 'config-1' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.not_draft',
      });
      expect(repository.publishConfig).not.toHaveBeenCalled();
    });
  });

  it('returns preview publish readiness and ignores cancelled entries in conflicts', async () => {
    const period = seedPeriod();
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [period],
      entries: [
        seedEntry({ id: 'entry-1', period }),
        seedEntry({
          id: 'entry-2',
          period,
          status: TimetableEntryStatus.CANCELLED,
        }),
      ],
    });
    const preview = new GetTimetablePreviewUseCase(repository);
    const conflicts = new ListTimetableConflictsUseCase(repository);

    await withScope(async () => {
      await expect(
        conflicts.execute({ timetableConfigId: 'config-1' }),
      ).resolves.toEqual({ items: [] });

      const response = await preview.execute({ timetableConfigId: 'config-1' });
      expect(response.publishReadiness).toMatchObject({
        canPublish: true,
        blockingReasons: [],
        warnings: [],
      });
      expect(response.conflicts).toEqual([]);
      expect(response).not.toHaveProperty('schoolId');
      expect(response).not.toHaveProperty('organizationId');
    });
  });

  it('blocks config period and entry mutations after publish', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
      entries: [seedEntry()],
    });
    const publish = new PublishTimetableUseCase(repository);
    const upsertConfig = new UpsertTimetableConfigUseCase(repository);
    const createPeriod = new CreateTimetablePeriodUseCase(repository);
    const updatePeriod = new UpdateTimetablePeriodUseCase(repository);
    const removePeriod = new DeleteTimetablePeriodUseCase(repository);
    const createEntry = new CreateTimetableEntryUseCase(repository);
    const updateEntry = new UpdateTimetableEntryUseCase(repository);
    const removeEntry = new DeleteTimetableEntryUseCase(repository);

    await withScope(async () => {
      await publish.execute({ timetableConfigId: 'config-1' });

      await expect(
        upsertConfig.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          name: 'Locked',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
      await expect(
        createPeriod.execute({
          timetableConfigId: 'config-1',
          index: 2,
          label: 'Period 2',
          startTime: '09:00',
          endTime: '09:45',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
      await expect(
        updatePeriod.execute('period-1', { label: 'Locked' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
      await expect(removePeriod.execute('period-1')).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
      await expect(
        createEntry.execute({
          timetableConfigId: 'config-1',
          periodId: 'period-1',
          dayOfWeek: 1,
          classroomId: 'classroom-1',
          teacherSubjectAllocationId: 'allocation-1',
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
      await expect(
        updateEntry.execute('entry-1', { notes: 'Locked' }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
      await expect(removeEntry.execute('entry-1')).rejects.toMatchObject({
        code: 'academics.timetable.published_locked',
      });
    });
  });

  it('returns a dashboard all read model grouped by classroom', async () => {
    const repository = createRepository({
      configs: [seedConfig({ status: TimetableConfigStatus.ACTIVE })],
      periods: [seedPeriod()],
      classrooms: [
        seedClassroom(),
        seedClassroom({
          id: 'classroom-2',
          sectionId: 'section-2',
          nameAr: 'Classroom 2',
          nameEn: 'Classroom 2',
          section: { id: 'section-2', gradeId: 'grade-1' },
        }),
      ],
      entries: [
        seedEntry({
          status: TimetableEntryStatus.ACTIVE,
          roomId: 'room-1',
          room: { id: 'room-1', nameAr: 'Room 1', nameEn: 'Room 1' },
        }),
      ],
      publications: [seedPublication()],
    });
    const dashboard = new GetTimetableDashboardAllUseCase(repository);

    await withScope(async () => {
      const response = await dashboard.execute({
        termId: 'term-1',
        gradeId: 'grade-1',
      });

      expect(response).toMatchObject({
        termId: 'term-1',
        academicYearId: 'year-1',
        isPublished: true,
      });
      expect(response.items).toHaveLength(2);
      expect(
        response.items.find((item) => item.classroomId === 'classroom-1'),
      ).toMatchObject({
        classroomId: 'classroom-1',
        classroom: { id: 'classroom-1' },
        grade: { id: 'grade-1' },
        configs: [{ id: 'config-1', status: 'active' }],
        periods: [{ id: 'period-1', index: 1 }],
        entries: [{ id: 'entry-1', status: 'active' }],
      });
      expect(
        response.items.find((item) => item.classroomId === 'classroom-2'),
      ).toMatchObject({
        classroom: { id: 'classroom-2' },
        entries: [],
      });
      expect(response.publishedAt).toBe('2026-05-22T10:00:00.000Z');
      expect(response.items[0].entries[0]).not.toHaveProperty('schoolId');
      expect(response.items[0].entries[0]).not.toHaveProperty('organizationId');
    });
  });

  it('bulk saves timetable entries by creating and updating slots', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [
        seedPeriod(),
        seedPeriod({
          id: 'period-2',
          periodIndex: 2,
          label: 'Period 2',
          startTime: '09:00',
          endTime: '09:45',
        }),
      ],
      entries: [seedEntry()],
    });
    const bulkSave = new BulkSaveTimetableEntriesUseCase(repository);

    await withScope(async () => {
      const response = await bulkSave.execute({
        termId: 'term-1',
        items: [
          {
            classroomId: 'classroom-1',
            dayOfWeek: 0,
            periodId: 'period-1',
            teacherSubjectAllocationId: 'allocation-1',
            roomId: 'room-1',
          },
          {
            classroomId: 'classroom-1',
            dayOfWeek: 0,
            periodId: 'period-2',
            teacherSubjectAllocationId: 'allocation-1',
          },
        ],
      });

      expect(response.summary).toEqual({
        requestedCount: 2,
        createdCount: 1,
        updatedCount: 1,
      });
      expect(response.items).toHaveLength(2);
      expect(response.items.map((item) => item.periodId)).toEqual([
        'period-1',
        'period-2',
      ]);
      expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            termId: 'term-1',
            gradeId: 'grade-1',
            subjectId: 'subject-1',
            teacherUserId: 'teacher-1',
          }),
        ]),
      );
    });
  });

  it('rejects duplicate bulk slots and missing weekly-hour matrix rows', async () => {
    await withScope(async () => {
      const duplicateRepository = createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
      });
      const bulkSaveDuplicates = new BulkSaveTimetableEntriesUseCase(
        duplicateRepository,
      );

      await expect(
        bulkSaveDuplicates.execute({
          termId: 'term-1',
          items: [
            {
              classroomId: 'classroom-1',
              dayOfWeek: 0,
              periodId: 'period-1',
              teacherSubjectAllocationId: 'allocation-1',
            },
            {
              classroomId: 'classroom-1',
              dayOfWeek: 0,
              periodId: 'period-1',
              teacherSubjectAllocationId: 'allocation-1',
            },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.duplicate_slot',
      });
      expect(duplicateRepository.bulkUpsertEntries).not.toHaveBeenCalled();

      const missingMatrixRepository = createRepository({
        configs: [seedConfig()],
        periods: [seedPeriod()],
        subjectAllocations: [],
      });
      const bulkSaveMissingMatrix = new BulkSaveTimetableEntriesUseCase(
        missingMatrixRepository,
      );

      await expect(
        bulkSaveMissingMatrix.execute({
          termId: 'term-1',
          items: [
            {
              classroomId: 'classroom-1',
              dayOfWeek: 0,
              periodId: 'period-1',
              teacherSubjectAllocationId: 'allocation-1',
            },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'academics.timetable.missing_subject_allocation',
      });
      expect(missingMatrixRepository.bulkUpsertEntries).not.toHaveBeenCalled();
    });
  });

  it('reports proposed timetable conflicts without persisting entries', async () => {
    const period = seedPeriod();
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [period],
      classrooms: [
        seedClassroom(),
        seedClassroom({
          id: 'classroom-2',
          sectionId: 'section-2',
          nameAr: 'Classroom 2',
          nameEn: 'Classroom 2',
          section: { id: 'section-2', gradeId: 'grade-1' },
        }),
      ],
      entries: [
        seedEntry({
          id: 'entry-existing',
          sectionId: 'section-2',
          classroomId: 'classroom-2',
          teacherUserId: 'teacher-1',
          roomId: 'room-1',
          period,
          room: { id: 'room-1', nameAr: 'Room 1', nameEn: 'Room 1' },
        }),
      ],
    });
    const conflictCheck = new CheckTimetableConflictsUseCase(repository);

    await withScope(async () => {
      const response = await conflictCheck.execute({
        termId: 'term-1',
        items: [
          {
            classroomId: 'classroom-1',
            dayOfWeek: 0,
            periodId: 'period-1',
            teacherSubjectAllocationId: 'allocation-1',
            roomId: 'room-1',
          },
        ],
      });

      expect(response.hasConflicts).toBe(true);
      expect(response.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'teacher_conflict',
            teacherUserId: 'teacher-1',
            entryIds: ['entry-existing'],
            proposedIndexes: [0],
          }),
          expect.objectContaining({
            code: 'room_conflict',
            roomId: 'room-1',
            entryIds: ['entry-existing'],
            proposedIndexes: [0],
          }),
        ]),
      );
      expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
    });
  });

  it('validates weekly hours and missing teacher allocations', async () => {
    const repository = createRepository({
      configs: [seedConfig()],
      periods: [seedPeriod()],
      entries: [seedEntry()],
      subjectAllocations: [
        seedSubjectAllocation({ weeklyHours: 2 }),
        seedSubjectAllocation({
          subjectId: 'subject-2',
          weeklyHours: 1,
        }),
      ],
    });
    const validate = new ValidateTimetableUseCase(repository);

    await withScope(async () => {
      const response = await validate.execute({ termId: 'term-1' });

      expect(response.summary).toMatchObject({
        classroomsChecked: 1,
        expectedWeeklySlots: 3,
        actualScheduledSlots: 1,
        missingTeacherAllocations: 1,
        underScheduledSubjects: 2,
      });
      expect(response.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subjectId: 'subject-1',
            expectedWeeklyHours: 2,
            scheduledWeeklyHours: 1,
            status: 'under_scheduled',
          }),
          expect.objectContaining({
            subjectId: 'subject-2',
            expectedWeeklyHours: 1,
            scheduledWeeklyHours: 0,
            status: 'missing_teacher_allocation',
            issues: expect.arrayContaining([
              expect.objectContaining({
                code: 'missing_teacher_allocation',
              }),
              expect.objectContaining({
                code: 'under_scheduled_subject',
              }),
            ]),
          }),
        ]),
      );
    });
  });

  it('unpublishes idempotently without deleting entries', async () => {
    const repository = createRepository({
      configs: [seedConfig({ status: TimetableConfigStatus.ACTIVE })],
      periods: [seedPeriod()],
      entries: [seedEntry({ status: TimetableEntryStatus.ACTIVE })],
      publications: [seedPublication()],
    });
    const unpublish = new UnpublishTimetableUseCase(repository);

    await withScope(async () => {
      await expect(
        unpublish.execute({ termId: 'term-1' }),
      ).resolves.toMatchObject({
        termId: 'term-1',
        academicYearId: 'year-1',
        summary: {
          configsChecked: 1,
          unpublishedCount: 1,
          entriesReturnedToDraft: 1,
        },
      });

      await expect(
        unpublish.execute({ termId: 'term-1' }),
      ).resolves.toMatchObject({
        summary: {
          configsChecked: 1,
          unpublishedCount: 0,
          entriesReturnedToDraft: 0,
        },
      });
      expect(repository.deleteEntry).not.toHaveBeenCalled();
    });
  });

  it('derives a stable internal attendance compatibility key from a timetable entry', () => {
    const key = deriveTimetableAttendanceCompatibilityKey(
      seedEntry(),
      '2026-09-15',
    );

    expect(key).toEqual({
      timetableEntryId: 'entry-1',
      date: '2026-09-15',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      periodId: 'period-1',
      periodKey: 'timetable-entry:entry-1',
      periodLabel: 'Period 1',
      periodStartTime: '08:00',
      periodEndTime: '08:45',
      teacherSubjectAllocationId: 'allocation-1',
    });
  });

  it('keeps timetable repository reads and updates on scoped Prisma', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateConfig = jest.fn().mockResolvedValue({});
    const updatePeriod = jest.fn().mockResolvedValue({});
    const updateEntry = jest.fn().mockResolvedValue({});
    const prisma = {
      scoped: {
        timetableConfig: { findFirst, update: updateConfig },
        timetablePeriod: { update: updatePeriod },
        timetableEntry: { update: updateEntry },
      },
    };
    const repository = new TimetableRepository(prisma as never);

    await repository.findConfigById('config-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'config-1' } }),
    );

    await withScope(async () => {
      await repository.updateConfig('config-1', { name: 'Updated' });
      await repository.updatePeriod('period-1', { label: 'Updated' });
      await repository.updateEntry('entry-1', { notes: 'Updated' });
    });

    expect(updateConfig).toHaveBeenCalled();
    expect(updatePeriod).toHaveBeenCalled();
    expect(updateEntry).toHaveBeenCalled();

    const source = readFileSync(
      __dirname + '/../infrastructure/timetable.repository.ts',
      'utf8',
    );
    expect(source).not.toContain('return this.prisma.timetableConfig.update');
    expect(source).not.toContain('return this.prisma.timetablePeriod.update');
    expect(source).not.toContain('return this.prisma.timetableEntry.update');
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
