import {
  TimetableConflictSeverity,
  TimetableConflictStatus,
  TimetableConflictType,
  TimetableEntryStatus,
} from '@prisma/client';
import { TimetableEntryRecord } from '../infrastructure/timetable.repository';

export interface ComputedTimetableConflict {
  id: string;
  conflictType: TimetableConflictType;
  severity: TimetableConflictSeverity;
  status: TimetableConflictStatus;
  dayOfWeek: number | null;
  periodId: string | null;
  entryId: string | null;
  relatedEntryId: string | null;
  teacherUserId: string | null;
  roomId: string | null;
  message: string;
}

export function computeTimetableConflicts(
  entries: TimetableEntryRecord[],
): ComputedTimetableConflict[] {
  const schedulableEntries = entries.filter(
    (entry) => entry.status !== TimetableEntryStatus.CANCELLED,
  );

  return [
    ...findPairConflicts(schedulableEntries, 'classroom'),
    ...findPairConflicts(schedulableEntries, 'teacher'),
    ...findPairConflicts(schedulableEntries, 'room'),
  ];
}

function findPairConflicts(
  entries: TimetableEntryRecord[],
  kind: 'classroom' | 'teacher' | 'room',
): ComputedTimetableConflict[] {
  const groups = new Map<string, TimetableEntryRecord[]>();

  for (const entry of entries) {
    const resourceId = resourceFor(entry, kind);
    if (!resourceId) continue;

    const key = `${entry.dayOfWeek}:${entry.periodId}:${resourceId}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const conflicts: ComputedTimetableConflict[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (let index = 1; index < group.length; index += 1) {
      conflicts.push(buildConflict(kind, group[0], group[index]));
    }
  }

  return conflicts;
}

function resourceFor(
  entry: TimetableEntryRecord,
  kind: 'classroom' | 'teacher' | 'room',
): string | null {
  if (kind === 'classroom') return entry.classroomId;
  if (kind === 'teacher') return entry.teacherUserId;
  return entry.roomId ?? null;
}

function buildConflict(
  kind: 'classroom' | 'teacher' | 'room',
  first: TimetableEntryRecord,
  second: TimetableEntryRecord,
): ComputedTimetableConflict {
  const type =
    kind === 'classroom'
      ? TimetableConflictType.CLASSROOM_SLOT
      : kind === 'teacher'
        ? TimetableConflictType.TEACHER
        : TimetableConflictType.ROOM;

  return {
    id: `computed:${type}:${first.id}:${second.id}`,
    conflictType: type,
    severity: TimetableConflictSeverity.BLOCKING,
    status: TimetableConflictStatus.OPEN,
    dayOfWeek: first.dayOfWeek,
    periodId: first.periodId,
    entryId: first.id,
    relatedEntryId: second.id,
    teacherUserId: kind === 'teacher' ? first.teacherUserId : null,
    roomId: kind === 'room' ? first.roomId : null,
    message: messageFor(kind),
  };
}

function messageFor(kind: 'classroom' | 'teacher' | 'room'): string {
  if (kind === 'classroom') {
    return 'Classroom has more than one timetable entry in this period.';
  }
  if (kind === 'teacher') {
    return 'Teacher is assigned to more than one timetable entry in this period.';
  }
  return 'Room is assigned to more than one timetable entry in this period.';
}
