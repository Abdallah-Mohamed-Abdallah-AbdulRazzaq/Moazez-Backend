import { TimetableEntryStatus, TimetablePeriodType } from '@prisma/client';
import {
  buildCanonicalTimetableDemand,
  reconcileCanonicalTimetableDemand,
} from '../domain/canonical-timetable-demand';
import { findTimetableIntervalConflicts } from '../domain/timetable-conflicts';
import {
  buildTimetableGenerationPlan,
  TimetableGenerationProposal,
} from '../domain/timetable-generator';
import {
  TimetableClassroomRecord,
  TimetableEntryRecord,
  TimetablePeriodRecord,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';

describe('authoritative timetable generator', () => {
  it('fills two canonical subjects exactly and keeps proposals conflict-free and roomless', () => {
    const classroom = seedClassroom();
    const subjectAllocations = [
      seedSubjectAllocation({ subjectId: 'math', weeklyHours: 3 }),
      seedSubjectAllocation({ subjectId: 'english', weeklyHours: 2 }),
    ];
    const teacherAllocations = [
      seedTeacherAllocation({ id: 'math-allocation', subjectId: 'math' }),
      seedTeacherAllocation({
        id: 'english-allocation',
        subjectId: 'english',
        teacherUserId: 'teacher-english',
      }),
    ];
    const plan = planFor({
      classrooms: [classroom],
      subjectAllocations,
      teacherAllocations,
      periods: periods(5),
    });

    expect(plan.searchBudgetExhausted).toBe(false);
    expect(plan.unresolved).toEqual([]);
    expect(plan.proposals).toHaveLength(5);
    expect(countSubjects(plan.proposals)).toEqual({ english: 2, math: 3 });
    expect(plan.proposals.every((proposal) => proposal.roomId === null)).toBe(
      true,
    );
    expect(conflictsForProposals(plan.proposals)).toEqual([]);
  });

  it('fills only the remainder, preserves manual entries, and is idempotent on a second run', () => {
    const existing = [
      seedEntry({ id: 'manual-1', dayOfWeek: 0, period: periods(2)[0] }),
      seedEntry({ id: 'manual-2', dayOfWeek: 0, period: periods(2)[1] }),
    ];
    const before = structuredClone(existing);
    const input = {
      subjectAllocations: [seedSubjectAllocation({ weeklyHours: 5 })],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: periods(5),
      existingTermEntries: existing,
    };
    const first = planFor(input);

    expect(first.proposals).toHaveLength(3);
    expect(existing).toEqual(before);

    const generated = first.proposals.map((proposal, index) =>
      proposalEntry(proposal, `generated-${index}`),
    );
    const second = planFor({
      ...input,
      existingTermEntries: [...existing, ...generated],
    });
    expect(second.proposals).toEqual([]);
    expect(second.unresolved).toEqual([]);
  });

  it('avoids a cross-config teacher overlap while allowing an adjacent interval', () => {
    const existing = seedEntry({
      id: 'other-config-entry',
      timetableConfigId: 'other-config',
      classroomId: 'other-classroom',
      sectionId: 'other-section',
      gradeId: 'other-grade',
      periodId: 'other-period',
      period: {
        id: 'other-period',
        periodIndex: 1,
        label: 'Other',
        startTime: '08:00',
        endTime: '08:45',
      },
    });
    const plan = planFor({
      subjectAllocations: [seedSubjectAllocation()],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: [
        seedPeriod({ id: 'overlap', startTime: '08:30', endTime: '09:00' }),
        seedPeriod({
          id: 'adjacent',
          periodIndex: 2,
          startTime: '08:45',
          endTime: '09:30',
        }),
      ],
      existingTermEntries: [existing],
    });

    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0].periodId).toBe('adjacent');
  });

  it('avoids a cross-config classroom overlap even when the teacher is free', () => {
    const occupiedClassroom = seedEntry({
      id: 'other-config-classroom-entry',
      timetableConfigId: 'other-config',
      subjectId: 'other-subject',
      teacherUserId: 'other-teacher',
      teacherSubjectAllocationId: 'other-allocation',
      periodId: 'other-period',
      period: {
        id: 'other-period',
        periodIndex: 1,
        label: 'Other',
        startTime: '08:00',
        endTime: '08:45',
      },
    });
    const plan = planFor({
      subjectAllocations: [seedSubjectAllocation()],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: [
        seedPeriod({ id: 'overlap', startTime: '08:15', endTime: '09:00' }),
        seedPeriod({
          id: 'free',
          periodIndex: 2,
          startTime: '09:00',
          endTime: '09:45',
        }),
      ],
      existingTermEntries: [occupiedClassroom],
    });

    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0].periodId).toBe('free');
  });

  it('selects the lower-workload teacher deterministically with lexical tie breaks', () => {
    const allocations = [
      seedTeacherAllocation({ id: 'allocation-z', teacherUserId: 'teacher-z' }),
      seedTeacherAllocation({ id: 'allocation-a', teacherUserId: 'teacher-a' }),
    ];
    const teacherAWorkload = seedEntry({
      id: 'teacher-a-existing',
      timetableConfigId: 'other-config',
      classroomId: 'other-classroom',
      sectionId: 'other-section',
      gradeId: 'other-grade',
      teacherUserId: 'teacher-a',
      teacherSubjectAllocationId: 'other-allocation',
      dayOfWeek: 4,
    });
    const input = {
      subjectAllocations: [seedSubjectAllocation()],
      teacherAllocations: allocations,
      classrooms: [seedClassroom()],
      periods: [seedPeriod()],
      existingTermEntries: [teacherAWorkload],
    };

    expect(planFor(input).proposals[0].teacherUserId).toBe('teacher-z');
    expect(planFor(input).proposals).toEqual(planFor(input).proposals);

    const tie = planFor({ ...input, existingTermEntries: [] });
    expect(tie.proposals[0].teacherUserId).toBe('teacher-a');
    expect(tie.proposals[0].teacherSubjectAllocationId).toBe('allocation-a');
  });

  it('returns safe unresolved results for no teacher, no slot, and existing overscheduling', () => {
    const missingTeacher = planFor({
      subjectAllocations: [seedSubjectAllocation()],
      teacherAllocations: [],
      classrooms: [seedClassroom()],
      periods: [seedPeriod()],
    });
    expect(missingTeacher.proposals).toEqual([]);
    expect(missingTeacher.unresolved.map((item) => item.code)).toEqual([
      'missing_teacher_allocation',
    ]);

    const noSlot = planFor({
      subjectAllocations: [seedSubjectAllocation()],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: [seedPeriod()],
      existingTermEntries: [0, 1, 2, 3, 4].map((dayOfWeek) =>
        seedEntry({
          id: `blocked-${dayOfWeek}`,
          subjectId: 'other-subject',
          dayOfWeek,
        }),
      ),
    });
    expect(noSlot.proposals).toEqual([]);
    expect(noSlot.unresolved.map((item) => item.code)).toEqual([
      'no_feasible_slot',
    ]);

    const overScheduled = planFor({
      subjectAllocations: [seedSubjectAllocation()],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: [seedPeriod()],
      existingTermEntries: [
        seedEntry({ id: 'existing-1', dayOfWeek: 0 }),
        seedEntry({ id: 'existing-2', dayOfWeek: 1 }),
      ],
    });
    expect(overScheduled.proposals).toEqual([]);
    expect(overScheduled.unresolved.map((item) => item.code)).toEqual([
      'existing_over_scheduled',
    ]);
  });

  it('excludes zero-hour curriculum and never saves a partial plan on budget exhaustion', () => {
    const zeroHour = planFor({
      subjectAllocations: [seedSubjectAllocation({ weeklyHours: 0 })],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: [seedPeriod()],
    });
    expect(zeroHour.proposals).toEqual([]);
    expect(zeroHour.unresolved).toEqual([]);

    const exhausted = planFor({
      subjectAllocations: [seedSubjectAllocation({ weeklyHours: 2 })],
      teacherAllocations: [seedTeacherAllocation()],
      classrooms: [seedClassroom()],
      periods: periods(2),
      searchNodeBudget: 1,
    });
    expect(exhausted.searchBudgetExhausted).toBe(true);
    expect(exhausted.proposals).toEqual([]);
    expect(exhausted.unresolved.map((item) => item.code)).toEqual([
      'search_budget_exhausted',
    ]);
  });
});

function planFor(input: {
  subjectAllocations: TimetableSubjectAllocationRecord[];
  teacherAllocations: TimetableTeacherAllocationRecord[];
  classrooms: TimetableClassroomRecord[];
  periods: TimetablePeriodRecord[];
  existingTermEntries?: TimetableEntryRecord[];
  searchNodeBudget?: number;
}) {
  const existingTermEntries = input.existingTermEntries ?? [];
  const demand = reconcileCanonicalTimetableDemand(
    buildCanonicalTimetableDemand(input),
    existingTermEntries.filter(
      (entry) => entry.timetableConfigId === 'config-1',
    ),
  );
  return buildTimetableGenerationPlan({
    timetableConfigId: 'config-1',
    activeDays: [0, 1, 2, 3, 4],
    demand,
    periods: input.periods,
    teacherAllocations: input.teacherAllocations,
    existingTermEntries,
    searchNodeBudget: input.searchNodeBudget,
  });
}

function periods(count: number): TimetablePeriodRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const startMinute = 8 * 60 + index * 60;
    return seedPeriod({
      id: `period-${index + 1}`,
      periodIndex: index + 1,
      startTime: minuteTime(startMinute),
      endTime: minuteTime(startMinute + 45),
    });
  });
}

function seedPeriod(
  overrides: Partial<TimetablePeriodRecord> = {},
): TimetablePeriodRecord {
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
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
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

function seedSubjectAllocation(
  overrides: Partial<TimetableSubjectAllocationRecord> = {},
): TimetableSubjectAllocationRecord {
  const subjectId = overrides.subjectId ?? 'subject-1';
  return {
    id: `subject-allocation-${subjectId}`,
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    subjectId,
    weeklyHours: 1,
    deletedAt: null,
    grade: { id: 'grade-1', nameAr: 'Grade', nameEn: 'Grade' },
    subject: {
      id: subjectId,
      nameAr: subjectId,
      nameEn: subjectId,
      code: subjectId,
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
  const period = overrides.period ?? seedPeriod();
  return {
    id: 'entry-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    timetableConfigId: 'config-1',
    periodId: period.id,
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
    period,
    classroom: {
      id: overrides.classroomId ?? 'classroom-1',
      nameAr: 'Classroom',
      nameEn: 'Classroom',
      capacity: 20,
    },
    subject: {
      id: overrides.subjectId ?? 'subject-1',
      nameAr: 'Subject',
      nameEn: 'Subject',
      code: 'SUB',
    },
    teacherUser: {
      id: overrides.teacherUserId ?? 'teacher-1',
      firstName: 'Teacher',
      lastName: 'One',
    },
    room: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function proposalEntry(
  proposal: TimetableGenerationProposal,
  id: string,
): TimetableEntryRecord {
  return seedEntry({
    id,
    schoolId: proposal.schoolId,
    academicYearId: proposal.academicYearId,
    termId: proposal.termId,
    timetableConfigId: proposal.timetableConfigId,
    periodId: proposal.periodId,
    dayOfWeek: proposal.dayOfWeek,
    gradeId: proposal.gradeId,
    sectionId: proposal.sectionId,
    classroomId: proposal.classroomId,
    subjectId: proposal.subjectId,
    teacherUserId: proposal.teacherUserId,
    teacherSubjectAllocationId: proposal.teacherSubjectAllocationId,
    period: proposal.period,
  });
}

function conflictsForProposals(proposals: TimetableGenerationProposal[]) {
  return findTimetableIntervalConflicts(
    proposals.map((proposal) => ({
      identity: `proposal-${proposal.proposedIndex}`,
      schoolId: proposal.schoolId,
      termId: proposal.termId,
      timetableConfigId: proposal.timetableConfigId,
      entryId: null,
      proposedIndex: proposal.proposedIndex,
      classroomId: proposal.classroomId,
      teacherUserId: proposal.teacherUserId,
      roomId: proposal.roomId,
      dayOfWeek: proposal.dayOfWeek,
      periodId: proposal.periodId,
      startTime: proposal.period.startTime,
      endTime: proposal.period.endTime,
    })),
  );
}

function countSubjects(proposals: TimetableGenerationProposal[]) {
  return proposals.reduce<Record<string, number>>((counts, proposal) => {
    counts[proposal.subjectId] = (counts[proposal.subjectId] ?? 0) + 1;
    return counts;
  }, {});
}

function minuteTime(minutes: number): string {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}
