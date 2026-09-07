import { TimetableEntryStatus } from '@prisma/client';
import {
  TimetableClassroomRecord,
  TimetableEntryRecord,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';

export type CanonicalTimetableDemandStatus =
  | 'COMPLETE'
  | 'UNDER_SCHEDULED'
  | 'OVER_SCHEDULED'
  | 'MISSING_TEACHER_ALLOCATION';

export interface CanonicalTimetableDemand {
  schoolId: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  classroomId: string;
  subjectId: string;
  requiredWeeklySlots: number;
  teacherSubjectAllocationIds: string[];
  subjectAllocation: TimetableSubjectAllocationRecord;
  classroom: TimetableClassroomRecord;
}

export interface ReconciledTimetableDemand extends CanonicalTimetableDemand {
  scheduledWeeklySlots: number;
  remainingWeeklySlots: number;
  status: CanonicalTimetableDemandStatus;
}

export function buildCanonicalTimetableDemand(input: {
  subjectAllocations: TimetableSubjectAllocationRecord[];
  classrooms: TimetableClassroomRecord[];
  teacherAllocations: TimetableTeacherAllocationRecord[];
}): CanonicalTimetableDemand[] {
  const classroomsByGrade = groupBy(
    input.classrooms,
    (classroom) => classroom.section.gradeId,
  );
  const teachersByClassSubject = groupBy(
    input.teacherAllocations,
    (allocation) => `${allocation.classroomId}:${allocation.subjectId}`,
  );
  const demand: CanonicalTimetableDemand[] = [];

  for (const allocation of input.subjectAllocations) {
    if (allocation.deletedAt !== null || allocation.weeklyHours <= 0) continue;

    for (const classroom of classroomsByGrade.get(allocation.gradeId) ?? []) {
      if (classroom.schoolId !== allocation.schoolId) continue;
      const teacherSubjectAllocationIds = (
        teachersByClassSubject.get(`${classroom.id}:${allocation.subjectId}`) ??
        []
      )
        .filter(
          (teacherAllocation) =>
            teacherAllocation.schoolId === allocation.schoolId &&
            teacherAllocation.termId === allocation.termId,
        )
        .map((teacherAllocation) => teacherAllocation.id)
        .sort();

      demand.push({
        schoolId: allocation.schoolId,
        academicYearId: allocation.academicYearId,
        termId: allocation.termId,
        gradeId: allocation.gradeId,
        classroomId: classroom.id,
        subjectId: allocation.subjectId,
        requiredWeeklySlots: allocation.weeklyHours,
        teacherSubjectAllocationIds,
        subjectAllocation: allocation,
        classroom,
      });
    }
  }

  return demand.sort((left, right) =>
    demandKey(left).localeCompare(demandKey(right)),
  );
}

export function reconcileCanonicalTimetableDemand(
  demand: CanonicalTimetableDemand[],
  entries: TimetableEntryRecord[],
): ReconciledTimetableDemand[] {
  const scheduledByDemand = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status === TimetableEntryStatus.CANCELLED) continue;
    const key = demandKey(entry);
    scheduledByDemand.set(key, (scheduledByDemand.get(key) ?? 0) + 1);
  }

  return demand.map((item) => {
    const scheduledWeeklySlots = scheduledByDemand.get(demandKey(item)) ?? 0;
    return {
      ...item,
      scheduledWeeklySlots,
      remainingWeeklySlots: Math.max(
        item.requiredWeeklySlots - scheduledWeeklySlots,
        0,
      ),
      status: reconcileStatus(item, scheduledWeeklySlots),
    };
  });
}

export function canonicalTimetableDemandKey(input: {
  schoolId: string;
  termId: string;
  classroomId: string;
  subjectId: string;
}): string {
  return demandKey(input);
}

function reconcileStatus(
  demand: CanonicalTimetableDemand,
  scheduledWeeklySlots: number,
): CanonicalTimetableDemandStatus {
  if (demand.teacherSubjectAllocationIds.length === 0) {
    return 'MISSING_TEACHER_ALLOCATION';
  }
  if (scheduledWeeklySlots < demand.requiredWeeklySlots) {
    return 'UNDER_SCHEDULED';
  }
  if (scheduledWeeklySlots > demand.requiredWeeklySlots) {
    return 'OVER_SCHEDULED';
  }
  return 'COMPLETE';
}

function demandKey(input: {
  schoolId: string;
  termId: string;
  classroomId: string;
  subjectId: string;
}): string {
  return `${input.schoolId}:${input.termId}:${input.classroomId}:${input.subjectId}`;
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
