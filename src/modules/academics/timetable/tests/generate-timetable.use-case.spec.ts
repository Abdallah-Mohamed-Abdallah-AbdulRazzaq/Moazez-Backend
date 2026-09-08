import {
  TimetableConfigStatus,
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
import { GenerateTimetableUseCase } from '../application/generate-timetable.use-case';
import {
  BulkTimetableEntryInput,
  TimetableClassroomRecord,
  TimetableConfigRecord,
  TimetableEntryRecord,
  TimetableGenerationSnapshot,
  TimetableGenerationTransactionDecision,
  TimetableGenerationTransactionResult,
  TimetableGradeRecord,
  TimetablePeriodRecord,
  TimetableRepository,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';

describe('GenerateTimetableUseCase', () => {
  it('fills only missing demand, preserves manual rows, stays draft, and is idempotent', async () => {
    const manual = seedEntry();
    const harness = generationHarness({
      periods: periods(2),
      subjectAllocations: [seedSubjectAllocation({ weeklyHours: 2 })],
      entries: [manual],
    });
    const useCase = new GenerateTimetableUseCase(harness.repository);
    const manualBefore = semanticEntry(manual);

    await withScope(async () => {
      const first = await useCase.execute({ timetableConfigId: 'config-1' });

      expect(first.createdCount).toBe(1);
      expect(first.remainingDemandCount).toBe(0);
      expect(first.complete).toBe(true);
      expect(first.unresolved).toEqual([]);
      expect(first.publishReadiness.canPublish).toBe(true);
      expect(first.validation.summary.teacherConflicts).toBe(0);
      expect(first.validation.summary.classroomConflicts).toBe(0);
      expect(first.validation.summary.roomConflicts).toBe(0);
      expect(harness.state.config.status).toBe(TimetableConfigStatus.DRAFT);
      expect(harness.state.entries).toHaveLength(2);
      expect(harness.state.entries.map((entry) => entry.roomId)).toEqual([
        null,
        null,
      ]);
      expect(semanticEntry(harness.state.entries[0])).toEqual(manualBefore);

      const second = await useCase.execute({ timetableConfigId: 'config-1' });
      expect(second.createdCount).toBe(0);
      expect(second.createdEntryIds).toEqual([]);
      expect(second.complete).toBe(true);
      expect(semanticEntry(harness.state.entries[0])).toEqual(manualBefore);
    });
  });

  it.each([
    {
      scopeType: TimetableScopeType.TERM,
      scope: {},
      expectedClassrooms: ['classroom-1', 'classroom-2'],
    },
    {
      scopeType: TimetableScopeType.STAGE,
      scope: { stageId: 'stage-1' },
      expectedClassrooms: ['classroom-1'],
    },
    {
      scopeType: TimetableScopeType.GRADE,
      scope: { gradeId: 'grade-1' },
      expectedClassrooms: ['classroom-1'],
    },
    {
      scopeType: TimetableScopeType.SECTION,
      scope: { sectionId: 'section-1' },
      expectedClassrooms: ['classroom-1'],
    },
    {
      scopeType: TimetableScopeType.CLASSROOM,
      scope: { classroomId: 'classroom-1' },
      expectedClassrooms: ['classroom-1'],
    },
  ])(
    'uses only persisted $scopeType scope',
    async ({ scopeType, scope, expectedClassrooms }) => {
      const classrooms = [
        seedClassroom(),
        seedClassroom({
          id: 'classroom-2',
          sectionId: 'section-2',
          section: {
            id: 'section-2',
            gradeId: 'grade-2',
            grade: { id: 'grade-2', stageId: 'stage-2' },
          },
        }),
      ];
      const harness = generationHarness({
        config: seedConfig({ scopeType, ...scope }),
        classrooms,
        grades: [seedGrade(), seedGrade({ id: 'grade-2', stageId: 'stage-2' })],
        subjectAllocations: [
          seedSubjectAllocation(),
          seedSubjectAllocation({ gradeId: 'grade-2' }),
        ],
        teacherAllocations: [
          seedTeacherAllocation(),
          seedTeacherAllocation({
            id: 'allocation-2',
            teacherUserId: 'teacher-2',
            classroomId: 'classroom-2',
          }),
        ],
      });
      const useCase = new GenerateTimetableUseCase(harness.repository);

      await withScope(async () => {
        const response = await useCase.execute({
          timetableConfigId: 'config-1',
        });
        expect(response.createdCount).toBe(expectedClassrooms.length);
        expect(
          harness.state.entries
            .map((entry) => entry.classroomId)
            .sort((left, right) => left.localeCompare(right)),
        ).toEqual(expectedClassrooms);
        expect(
          harness.state.entries.every(
            (entry) => entry.timetableConfigId === 'config-1',
          ),
        ).toBe(true);
      });
    },
  );

  it('returns a structured missing-teacher result without persisting a row', async () => {
    const harness = generationHarness({ teacherAllocations: [] });
    const useCase = new GenerateTimetableUseCase(harness.repository);

    await withScope(async () => {
      const response = await useCase.execute({ timetableConfigId: 'config-1' });
      expect(response.createdCount).toBe(0);
      expect(response.complete).toBe(false);
      expect(response.unresolved.map((item) => item.code)).toEqual([
        'missing_teacher_allocation',
      ]);
      expect(harness.state.entries).toEqual([]);
    });
  });

  it('does not persist when every slot is blocked by another config', async () => {
    const fixedEntry = seedEntry({
      timetableConfigId: 'other-config',
      subjectId: 'other-subject',
      teacherUserId: 'other-teacher',
      teacherSubjectAllocationId: 'other-allocation',
    });
    const harness = generationHarness({ entries: [fixedEntry] });
    const useCase = new GenerateTimetableUseCase(harness.repository);

    await withScope(async () => {
      const response = await useCase.execute({ timetableConfigId: 'config-1' });
      expect(response.createdCount).toBe(0);
      expect(response.unresolved.map((item) => item.code)).toEqual([
        'no_feasible_slot',
      ]);
      expect(harness.state.entries).toEqual([fixedEntry]);
    });
  });

  it('preserves authoritative missing-curriculum validation without inventing demand', async () => {
    const harness = generationHarness({ subjectAllocations: [] });
    const useCase = new GenerateTimetableUseCase(harness.repository);

    await withScope(async () => {
      const response = await useCase.execute({ timetableConfigId: 'config-1' });
      expect(response.createdCount).toBe(0);
      expect(response.validation.summary.missingSubjectAllocationRows).toBe(1);
      expect(response.validation.items[0]).toMatchObject({
        status: 'missing_subject_allocation',
        issues: [
          expect.objectContaining({ code: 'missing_subject_allocation_row' }),
        ],
      });
      expect(response.publishReadiness.canPublish).toBe(false);
      expect(harness.state.entries).toEqual([]);
    });
  });

  it('leaves all rows unchanged when transactional persistence fails', async () => {
    const manual = seedEntry();
    const harness = generationHarness({
      periods: periods(2),
      subjectAllocations: [seedSubjectAllocation({ weeklyHours: 2 })],
      entries: [manual],
      failPersistence: true,
    });
    const before = harness.state.entries.map(semanticEntry);
    const useCase = new GenerateTimetableUseCase(harness.repository);

    await withScope(async () => {
      await expect(
        useCase.execute({ timetableConfigId: 'config-1' }),
      ).rejects.toThrow('forced transactional persistence failure');
    });
    expect(harness.state.entries.map(semanticEntry)).toEqual(before);
  });
});

async function withScope<T>(testFn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'organization-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['academics.structure.manage'],
    });
    return testFn();
  });
}

function generationHarness(
  seed: {
    config?: TimetableConfigRecord;
    periods?: TimetablePeriodRecord[];
    entries?: TimetableEntryRecord[];
    classrooms?: TimetableClassroomRecord[];
    grades?: TimetableGradeRecord[];
    subjectAllocations?: TimetableSubjectAllocationRecord[];
    teacherAllocations?: TimetableTeacherAllocationRecord[];
    failPersistence?: boolean;
  } = {},
) {
  const state = {
    config: seed.config ?? seedConfig(),
    entries: [...(seed.entries ?? [])],
  };
  const source = {
    periods: seed.periods ?? periods(1),
    classrooms: seed.classrooms ?? [seedClassroom()],
    grades: seed.grades ?? [seedGrade()],
    subjectAllocations: seed.subjectAllocations ?? [seedSubjectAllocation()],
    teacherAllocations: seed.teacherAllocations ?? [seedTeacherAllocation()],
  };
  const snapshot = (): TimetableGenerationSnapshot => ({
    config: state.config,
    academicYear: { id: 'year-1', schoolId: 'school-1', isActive: true },
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      isActive: true,
    },
    periods: source.periods,
    candidateEntries: state.entries.filter(
      (entry) => entry.timetableConfigId === state.config.id,
    ),
    termEntries: state.entries.filter(
      (entry) => entry.termId === state.config.termId,
    ),
    classrooms: source.classrooms,
    grades: source.grades,
    subjectAllocations: source.subjectAllocations,
    teacherAllocations: source.teacherAllocations,
    rooms: [],
  });
  const loadGenerationSnapshot = jest.fn(() => Promise.resolve(snapshot()));
  const generateEntriesAtomically = jest.fn(function generateAtomically<T>(
    _configId: string,
    plan: (
      current: TimetableGenerationSnapshot,
    ) => TimetableGenerationTransactionDecision<T>,
  ): Promise<TimetableGenerationTransactionResult<T>> {
    const before = snapshot();
    const decision = plan(before);
    const staged = decision.entries.map((entry, index) =>
      generatedEntry(entry, source, state.entries.length + index + 1),
    );
    if (seed.failPersistence && staged.length > 0) {
      return Promise.reject(
        new Error('forced transactional persistence failure'),
      );
    }
    state.entries.push(...staged);
    return Promise.resolve({
      status: 'created' as const,
      value: decision.value,
      createdEntryIds: staged.map((entry) => entry.id).sort(),
      before,
      after: snapshot(),
    });
  });
  const repository = {
    loadGenerationSnapshot,
    generateEntriesAtomically,
  } as unknown as TimetableRepository;

  return { repository, state };
}

function generatedEntry(
  input: BulkTimetableEntryInput,
  source: {
    periods: TimetablePeriodRecord[];
    classrooms: TimetableClassroomRecord[];
    subjectAllocations: TimetableSubjectAllocationRecord[];
  },
  sequence: number,
): TimetableEntryRecord {
  const period = source.periods.find((item) => item.id === input.periodId)!;
  const classroom = source.classrooms.find(
    (item) => item.id === input.classroomId,
  )!;
  const allocation = source.subjectAllocations.find(
    (item) =>
      item.gradeId === input.gradeId && item.subjectId === input.subjectId,
  )!;
  return seedEntry({
    ...input,
    id: `generated-${sequence}`,
    notes: null,
    status: TimetableEntryStatus.DRAFT,
    period: {
      id: period.id,
      periodIndex: period.periodIndex,
      label: period.label,
      startTime: period.startTime,
      endTime: period.endTime,
    },
    classroom: {
      id: classroom.id,
      nameAr: classroom.nameAr,
      nameEn: classroom.nameEn,
      capacity: classroom.capacity,
    },
    subject: {
      id: allocation.subject.id,
      nameAr: allocation.subject.nameAr,
      nameEn: allocation.subject.nameEn,
      code: allocation.subject.code,
    },
    teacherUser: {
      id: input.teacherUserId,
      firstName: 'Teacher',
      lastName: input.teacherUserId,
    },
  });
}

function seedConfig(
  overrides: Partial<TimetableConfigRecord> = {},
): TimetableConfigRecord {
  return {
    id: 'config-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    name: 'Generator',
    weekStartDay: 0,
    activeDays: [0],
    scopeType: TimetableScopeType.TERM,
    scopeKey: 'term:term-1',
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    status: TimetableConfigStatus.DRAFT,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function periods(count: number): TimetablePeriodRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `period-${index + 1}`,
    schoolId: 'school-1',
    timetableConfigId: 'config-1',
    periodIndex: index + 1,
    label: `Period ${index + 1}`,
    startTime: `${(8 + index).toString().padStart(2, '0')}:00`,
    endTime: `${(8 + index).toString().padStart(2, '0')}:45`,
    type: TimetablePeriodType.CLASS,
    isInstructional: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

function seedClassroom(
  overrides: Partial<TimetableClassroomRecord> = {},
): TimetableClassroomRecord {
  return {
    id: 'classroom-1',
    schoolId: 'school-1',
    sectionId: 'section-1',
    nameAr: 'Classroom',
    nameEn: 'Classroom',
    capacity: 20,
    section: {
      id: 'section-1',
      gradeId: 'grade-1',
      grade: { id: 'grade-1', stageId: 'stage-1' },
    },
    ...overrides,
  };
}

function seedGrade(
  overrides: Partial<TimetableGradeRecord> = {},
): TimetableGradeRecord {
  return {
    id: 'grade-1',
    schoolId: 'school-1',
    stageId: 'stage-1',
    nameAr: 'Grade',
    nameEn: 'Grade',
    ...overrides,
  };
}

function seedSubjectAllocation(
  overrides: Partial<TimetableSubjectAllocationRecord> = {},
): TimetableSubjectAllocationRecord {
  const gradeId = overrides.gradeId ?? 'grade-1';
  return {
    id: `subject-allocation-${gradeId}`,
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId,
    subjectId: 'subject-1',
    weeklyHours: 1,
    deletedAt: null,
    grade: { id: gradeId, nameAr: 'Grade', nameEn: 'Grade' },
    subject: {
      id: 'subject-1',
      nameAr: 'Math',
      nameEn: 'Math',
      code: 'MATH',
      color: null,
    },
    ...overrides,
  };
}

function seedTeacherAllocation(
  overrides: Partial<TimetableTeacherAllocationRecord> = {},
): TimetableTeacherAllocationRecord {
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

function seedEntry(
  overrides: Partial<TimetableEntryRecord> = {},
): TimetableEntryRecord {
  return {
    id: 'manual-1',
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
    notes: 'manual',
    status: TimetableEntryStatus.DRAFT,
    period: {
      id: 'period-1',
      periodIndex: 1,
      label: 'Period 1',
      startTime: '08:00',
      endTime: '08:45',
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Classroom',
      nameEn: 'Classroom',
      capacity: 20,
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
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function semanticEntry(entry: TimetableEntryRecord) {
  return {
    id: entry.id,
    periodId: entry.periodId,
    dayOfWeek: entry.dayOfWeek,
    teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
    roomId: entry.roomId,
    status: entry.status,
    notes: entry.notes,
  };
}
