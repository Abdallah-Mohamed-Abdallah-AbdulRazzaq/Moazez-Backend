import { TimetableEntryStatus } from '@prisma/client';
import * as activeCurriculumPolicy from '../../subject-allocation/domain/active-curriculum.policy';
import {
  buildCanonicalTimetableDemand,
  CanonicalTimetableDemand,
  reconcileCanonicalTimetableDemand,
} from '../domain/canonical-timetable-demand';
import {
  TimetableClassroomRecord,
  TimetableEntryRecord,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';

describe('canonical timetable demand', () => {
  it('delegates taught classification to the central active-curriculum policy', () => {
    const allocations = [
      subjectAllocation({ id: 'positive', weeklyHours: 1 }),
      subjectAllocation({ id: 'zero', weeklyHours: 0 }),
      subjectAllocation({ id: 'negative', weeklyHours: -1 }),
    ];
    const policy = jest.spyOn(
      activeCurriculumPolicy,
      'isActiveCurriculumRequirement',
    );

    try {
      const demand = buildCanonicalTimetableDemand({
        subjectAllocations: allocations,
        classrooms: [classroom({ id: 'classroom-a' })],
        teacherAllocations: [],
      });

      expect(demand).toHaveLength(1);
      expect(demand[0].subjectAllocation.id).toBe('positive');
      expect(policy).toHaveBeenCalledTimes(3);
      for (const allocation of allocations) {
        expect(policy).toHaveBeenCalledWith(allocation);
      }
    } finally {
      policy.mockRestore();
    }
  });

  it('expands positive weekly periods per classroom and keeps every teacher allocation id', () => {
    const demand = buildCanonicalTimetableDemand({
      subjectAllocations: [
        subjectAllocation({ id: 'positive', weeklyHours: 3 }),
        subjectAllocation({
          id: 'zero',
          subjectId: 'subject-zero',
          weeklyHours: 0,
        }),
        subjectAllocation({
          id: 'negative',
          subjectId: 'subject-negative',
          weeklyHours: -1,
        }),
        subjectAllocation({
          id: 'deleted',
          subjectId: 'subject-deleted',
          deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
      classrooms: [
        classroom({ id: 'classroom-a' }),
        classroom({ id: 'classroom-b' }),
        classroom({ id: 'other-grade', gradeId: 'grade-2' }),
      ],
      teacherAllocations: [
        teacherAllocation({ id: 'allocation-a-2', classroomId: 'classroom-a' }),
        teacherAllocation({ id: 'allocation-a-1', classroomId: 'classroom-a' }),
        teacherAllocation({ id: 'allocation-b-1', classroomId: 'classroom-b' }),
      ],
    });

    expect(demand).toHaveLength(2);
    expect(
      demand.map((item) => ({
        classroomId: item.classroomId,
        requiredWeeklySlots: item.requiredWeeklySlots,
        teacherSubjectAllocationIds: item.teacherSubjectAllocationIds,
      })),
    ).toEqual([
      {
        classroomId: 'classroom-a',
        requiredWeeklySlots: 3,
        teacherSubjectAllocationIds: ['allocation-a-1', 'allocation-a-2'],
      },
      {
        classroomId: 'classroom-b',
        requiredWeeklySlots: 3,
        teacherSubjectAllocationIds: ['allocation-b-1'],
      },
    ]);
  });

  it('preserves missing teacher allocation as demand status', () => {
    const demand = buildCanonicalTimetableDemand({
      subjectAllocations: [subjectAllocation({ weeklyHours: 3 })],
      classrooms: [classroom({ id: 'classroom-a' })],
      teacherAllocations: [],
    });

    expect(
      reconcileCanonicalTimetableDemand(demand, [
        entry(0),
        entry(1),
        entry(2),
      ])[0],
    ).toEqual(
      expect.objectContaining({
        requiredWeeklySlots: 3,
        scheduledWeeklySlots: 3,
        remainingWeeklySlots: 0,
        status: 'MISSING_TEACHER_ALLOCATION',
        teacherSubjectAllocationIds: [],
      }),
    );
  });

  it.each([
    [0, 'UNDER_SCHEDULED', 3],
    [2, 'UNDER_SCHEDULED', 1],
    [3, 'COMPLETE', 0],
    [4, 'OVER_SCHEDULED', 0],
  ] as const)(
    'reconciles three required slots against %s scheduled slots',
    (scheduled, status, remaining) => {
      const demand = canonicalDemand();
      const entries = Array.from({ length: scheduled }, (_, index) =>
        entry(index),
      );
      entries.push(entry(99, TimetableEntryStatus.CANCELLED));

      expect(reconcileCanonicalTimetableDemand([demand], entries)[0]).toEqual(
        expect.objectContaining({
          requiredWeeklySlots: 3,
          scheduledWeeklySlots: scheduled,
          remainingWeeklySlots: remaining,
          status,
        }),
      );
    },
  );
});

function subjectAllocation(
  overrides: Partial<TimetableSubjectAllocationRecord>,
): TimetableSubjectAllocationRecord {
  return {
    id: 'subject-allocation-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    subjectId: 'subject-1',
    weeklyHours: 3,
    deletedAt: null,
    grade: { id: 'grade-1', nameAr: 'Grade', nameEn: 'Grade' },
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

function classroom(overrides: {
  id: string;
  gradeId?: string;
}): TimetableClassroomRecord {
  return {
    id: overrides.id,
    schoolId: 'school-1',
    sectionId: `section-${overrides.id}`,
    nameAr: overrides.id,
    nameEn: overrides.id,
    section: {
      id: `section-${overrides.id}`,
      gradeId: overrides.gradeId ?? 'grade-1',
      grade: { id: overrides.gradeId ?? 'grade-1', stageId: 'stage-1' },
    },
  };
}

function teacherAllocation(
  overrides: Partial<TimetableTeacherAllocationRecord>,
): TimetableTeacherAllocationRecord {
  return {
    id: 'teacher-allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-a',
    termId: 'term-1',
    ...overrides,
  };
}

function canonicalDemand(): CanonicalTimetableDemand {
  return {
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    classroomId: 'classroom-a',
    subjectId: 'subject-1',
    requiredWeeklySlots: 3,
    teacherSubjectAllocationIds: ['teacher-allocation-1'],
    subjectAllocation: subjectAllocation({}),
    classroom: classroom({ id: 'classroom-a' }),
  };
}

function entry(
  index: number,
  status: TimetableEntryStatus = TimetableEntryStatus.DRAFT,
): TimetableEntryRecord {
  return {
    id: `entry-${index}`,
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    timetableConfigId: 'config-1',
    periodId: `period-${index}`,
    dayOfWeek: index,
    gradeId: 'grade-1',
    sectionId: 'section-1',
    classroomId: 'classroom-a',
    subjectId: 'subject-1',
    teacherUserId: 'teacher-1',
    teacherSubjectAllocationId: 'teacher-allocation-1',
    roomId: null,
    notes: null,
    status,
    period: {
      id: `period-${index}`,
      periodIndex: index,
      label: `Period ${index}`,
      startTime: '08:00',
      endTime: '08:45',
    },
    classroom: { id: 'classroom-a', nameAr: 'A', nameEn: 'A' },
    subject: {
      id: 'subject-1',
      nameAr: 'Math',
      nameEn: 'Math',
      code: 'MATH',
    },
    teacherUser: { id: 'teacher-1', firstName: 'Teacher', lastName: 'One' },
    room: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}
