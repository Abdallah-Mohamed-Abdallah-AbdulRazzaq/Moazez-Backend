import { TimetableConflictType, TimetableEntryStatus } from '@prisma/client';
import { RoomSchedulingPolicy } from '../../rooms/domain/room-scheduling.policy';
import {
  buildCanonicalTimetableDemand,
  canonicalTimetableDemandKey,
  reconcileCanonicalTimetableDemand,
  ReconciledTimetableDemand,
} from '../domain/canonical-timetable-demand';
import {
  ComputedTimetableConflict,
  computeTimetableConflicts,
} from '../domain/timetable-conflicts';
import {
  TimetableValidationIssueDto,
  TimetableValidationItemDto,
  TimetableValidationResponseDto,
} from '../dto/timetable-response.dto';
import {
  TimetableClassroomRecord,
  TimetableEntryRecord,
  TimetableGradeRecord,
  TimetableRoomRecord,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';

export interface TimetableValidationContext {
  termId: string;
  academicYearId: string;
  classrooms: TimetableClassroomRecord[];
  grades: TimetableGradeRecord[];
  subjectAllocations: TimetableSubjectAllocationRecord[];
  teacherAllocations: TimetableTeacherAllocationRecord[];
  entries: TimetableEntryRecord[];
  conflictEntries: TimetableEntryRecord[];
  rooms: TimetableRoomRecord[];
}

export interface AuthoritativeTimetableValidation {
  response: TimetableValidationResponseDto;
  conflicts: ComputedTimetableConflict[];
}

export function buildAuthoritativeTimetableValidation(
  context: TimetableValidationContext,
): AuthoritativeTimetableValidation {
  const demand = buildCanonicalTimetableDemand({
    subjectAllocations: context.subjectAllocations,
    classrooms: context.classrooms,
    teacherAllocations: context.teacherAllocations,
  });
  const reconciledDemand = reconcileCanonicalTimetableDemand(
    demand,
    context.entries,
  );
  const items = buildValidationItems({
    classrooms: context.classrooms,
    grades: context.grades,
    demand: reconciledDemand,
    entries: context.entries,
    configuredGradeIds: new Set(
      context.subjectAllocations.map((allocation) => allocation.gradeId),
    ),
  });
  appendRoomValidationIssues(items, context.entries, context.rooms);
  sortValidationIssues(items);

  const conflicts = relevantTimetableConflicts(
    context.conflictEntries,
    context.entries,
  );
  const conflictCounts = countConflicts(conflicts);

  return {
    conflicts,
    response: {
      termId: context.termId,
      academicYearId: context.academicYearId,
      summary: {
        classroomsChecked: context.classrooms.length,
        expectedWeeklySlots: reconciledDemand.reduce(
          (sum, item) => sum + item.requiredWeeklySlots,
          0,
        ),
        actualScheduledSlots: context.entries.filter(isSchedulableEntry).length,
        missingTeacherAllocations: items.filter((item) =>
          item.issues.some(
            (issue) => issue.code === 'missing_teacher_allocation',
          ),
        ).length,
        underScheduledSubjects: items.filter((item) =>
          item.issues.some((issue) => issue.code === 'under_scheduled_subject'),
        ).length,
        overScheduledSubjects: items.filter((item) =>
          item.issues.some((issue) => issue.code === 'over_scheduled_subject'),
        ).length,
        teacherConflicts: conflictCounts.teacher,
        classroomConflicts: conflictCounts.classroom,
        roomConflicts: conflictCounts.room,
        missingSubjectAllocationRows: items.filter(
          (item) => item.status === 'missing_subject_allocation',
        ).length,
      },
      items,
    },
  };
}

function appendRoomValidationIssues(
  items: TimetableValidationItemDto[],
  entries: TimetableEntryRecord[],
  rooms: TimetableRoomRecord[],
): void {
  const itemsByDemandKey = new Map(
    items.map((item) => [validationItemKey(item), item]),
  );
  const roomsById = new Map(rooms.map((room) => [room.id, room]));

  for (const entry of entries.filter(isSchedulableEntry)) {
    if (!entry.roomId) continue;

    const item = itemsByDemandKey.get(validationItemKey(entry));
    if (!item) continue;

    const room = roomsById.get(entry.roomId) ?? null;
    const eligibility = RoomSchedulingPolicy.evaluate(room, entry.classroom);
    if (eligibility.eligible) continue;

    if (eligibility.reason === 'room_not_found') {
      item.issues.push({
        code: 'room_not_found',
        message: 'Scheduled room is missing or no longer available.',
        details: { entryId: entry.id, roomId: entry.roomId },
      });
      continue;
    }
    if (eligibility.reason === 'room_inactive') {
      item.issues.push({
        code: 'room_inactive',
        message: 'Scheduled room is inactive.',
        details: { entryId: entry.id, roomId: entry.roomId },
      });
      continue;
    }
    item.issues.push({
      code: 'room_capacity_insufficient',
      message: 'Scheduled room capacity is insufficient for the classroom.',
      details: {
        entryId: entry.id,
        roomId: entry.roomId,
        roomCapacity: room!.capacity,
        classroomId: entry.classroomId,
        classroomCapacity: entry.classroom.capacity,
      },
    });
  }
}

function validationItemKey(input: {
  classroomId: string;
  subjectId: string | null;
}): string {
  return `${input.classroomId}:${input.subjectId ?? ''}`;
}

function buildValidationItems(input: {
  classrooms: TimetableClassroomRecord[];
  grades: TimetableGradeRecord[];
  demand: ReconciledTimetableDemand[];
  entries: TimetableEntryRecord[];
  configuredGradeIds: Set<string>;
}): TimetableValidationItemDto[] {
  const gradesById = new Map(input.grades.map((grade) => [grade.id, grade]));
  const items = input.demand.map((demand) =>
    demandToValidationItem(demand, gradesById.get(demand.gradeId)),
  );
  const demandKeys = new Set(
    input.demand.map((demand) => canonicalTimetableDemandKey(demand)),
  );
  const staleEntries = new Map<string, TimetableEntryRecord[]>();

  for (const entry of input.entries.filter(isSchedulableEntry)) {
    const key = canonicalTimetableDemandKey(entry);
    if (demandKeys.has(key)) continue;
    staleEntries.set(key, [...(staleEntries.get(key) ?? []), entry]);
  }
  for (const entries of staleEntries.values()) {
    const first = entries[0];
    const grade = gradesById.get(first.gradeId);
    items.push({
      classroomId: first.classroomId,
      classroom: {
        id: first.classroom.id,
        nameAr: first.classroom.nameAr,
        nameEn: first.classroom.nameEn,
      },
      gradeId: first.gradeId,
      grade: {
        id: first.gradeId,
        nameAr: grade?.nameAr ?? '',
        nameEn: grade?.nameEn ?? '',
      },
      subjectId: first.subjectId,
      subject: {
        id: first.subject.id,
        nameAr: first.subject.nameAr,
        nameEn: first.subject.nameEn,
        code: first.subject.code ?? null,
        color: null,
      },
      expectedWeeklyHours: null,
      scheduledWeeklyHours: entries.length,
      status: 'missing_subject_allocation',
      issues: [
        {
          code: 'missing_subject_allocation_row',
          message:
            'Scheduled entries are not backed by an active subject allocation.',
          details: {
            gradeId: first.gradeId,
            subjectId: first.subjectId,
          },
        },
      ],
    });
  }

  const classroomsWithDemand = new Set(
    input.demand.map((demand) => demand.classroomId),
  );
  const classroomsWithStaleEntries = new Set(
    Array.from(staleEntries.values()).map((entries) => entries[0].classroomId),
  );
  for (const classroom of input.classrooms) {
    const gradeId = classroom.section.gradeId;
    if (
      classroomsWithDemand.has(classroom.id) ||
      classroomsWithStaleEntries.has(classroom.id) ||
      input.configuredGradeIds.has(gradeId)
    ) {
      continue;
    }
    const grade = gradesById.get(gradeId);
    items.push({
      classroomId: classroom.id,
      classroom: {
        id: classroom.id,
        nameAr: classroom.nameAr,
        nameEn: classroom.nameEn,
      },
      gradeId,
      grade: {
        id: gradeId,
        nameAr: grade?.nameAr ?? '',
        nameEn: grade?.nameEn ?? '',
      },
      subjectId: null,
      subject: null,
      expectedWeeklyHours: null,
      scheduledWeeklyHours: 0,
      status: 'missing_subject_allocation',
      issues: [
        {
          code: 'missing_subject_allocation_row',
          message:
            'No active subject allocation weekly-hours rows exist for this classroom grade.',
          details: { gradeId },
        },
      ],
    });
  }

  return items.sort((left, right) =>
    validationItemKey(left).localeCompare(validationItemKey(right)),
  );
}

function demandToValidationItem(
  demand: ReconciledTimetableDemand,
  grade: TimetableGradeRecord | undefined,
): TimetableValidationItemDto {
  const issues = buildDemandIssues(demand);
  const allocation = demand.subjectAllocation;
  return {
    classroomId: demand.classroomId,
    classroom: {
      id: demand.classroom.id,
      nameAr: demand.classroom.nameAr,
      nameEn: demand.classroom.nameEn,
    },
    gradeId: demand.gradeId,
    grade: {
      id: demand.gradeId,
      nameAr: grade?.nameAr ?? allocation.grade.nameAr,
      nameEn: grade?.nameEn ?? allocation.grade.nameEn,
    },
    subjectId: demand.subjectId,
    subject: {
      id: allocation.subject.id,
      nameAr: allocation.subject.nameAr,
      nameEn: allocation.subject.nameEn,
      code: allocation.subject.code ?? null,
      color: allocation.subject.color ?? null,
    },
    expectedWeeklyHours: demand.requiredWeeklySlots,
    scheduledWeeklyHours: demand.scheduledWeeklySlots,
    status: statusForIssues(issues),
    issues,
  };
}

function buildDemandIssues(
  demand: ReconciledTimetableDemand,
): TimetableValidationIssueDto[] {
  const issues: TimetableValidationIssueDto[] = [];
  if (demand.teacherSubjectAllocationIds.length === 0) {
    issues.push({
      code: 'missing_teacher_allocation',
      message:
        'Subject is missing a teacher allocation for this classroom and term.',
      details: { subjectId: demand.subjectId, gradeId: demand.gradeId },
    });
  }
  if (demand.scheduledWeeklySlots < demand.requiredWeeklySlots) {
    issues.push({
      code: 'under_scheduled_subject',
      message: 'Scheduled periods are below weekly hours.',
      details: {
        expectedWeeklyHours: demand.requiredWeeklySlots,
        scheduledWeeklyHours: demand.scheduledWeeklySlots,
      },
    });
  }
  if (demand.scheduledWeeklySlots > demand.requiredWeeklySlots) {
    issues.push({
      code: 'over_scheduled_subject',
      message: 'Scheduled periods exceed weekly hours.',
      details: {
        expectedWeeklyHours: demand.requiredWeeklySlots,
        scheduledWeeklyHours: demand.scheduledWeeklySlots,
      },
    });
  }
  return issues;
}

function statusForIssues(
  issues: TimetableValidationIssueDto[],
): TimetableValidationItemDto['status'] {
  if (issues.some((issue) => issue.code === 'missing_teacher_allocation')) {
    return 'missing_teacher_allocation';
  }
  if (issues.some((issue) => issue.code === 'under_scheduled_subject')) {
    return 'under_scheduled';
  }
  if (issues.some((issue) => issue.code === 'over_scheduled_subject')) {
    return 'over_scheduled';
  }
  return 'complete';
}

function relevantTimetableConflicts(
  conflictEntries: TimetableEntryRecord[],
  selectedEntries: TimetableEntryRecord[],
): ComputedTimetableConflict[] {
  const selectedEntryIds = new Set(selectedEntries.map((entry) => entry.id));
  return computeTimetableConflicts(conflictEntries).filter((conflict) =>
    conflict.entryIds.some((entryId) => selectedEntryIds.has(entryId)),
  );
}

function countConflicts(conflicts: ComputedTimetableConflict[]): {
  classroom: number;
  teacher: number;
  room: number;
} {
  return {
    classroom: conflicts.filter(
      (conflict) =>
        conflict.conflictType === TimetableConflictType.CLASSROOM_SLOT,
    ).length,
    teacher: conflicts.filter(
      (conflict) => conflict.conflictType === TimetableConflictType.TEACHER,
    ).length,
    room: conflicts.filter(
      (conflict) => conflict.conflictType === TimetableConflictType.ROOM,
    ).length,
  };
}

function sortValidationIssues(items: TimetableValidationItemDto[]): void {
  for (const item of items) {
    item.issues.sort((left, right) =>
      `${left.code}:${JSON.stringify(left.details ?? {})}`.localeCompare(
        `${right.code}:${JSON.stringify(right.details ?? {})}`,
      ),
    );
  }
}

function isSchedulableEntry(entry: TimetableEntryRecord): boolean {
  return entry.status !== TimetableEntryStatus.CANCELLED;
}
