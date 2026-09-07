import {
  TimetableConflictSeverity,
  TimetableConflictStatus,
  TimetableConflictType,
  TimetableEntryStatus,
} from '@prisma/client';
import { TimetableEntryRecord } from '../infrastructure/timetable.repository';
import {
  timetableTimeRangesOverlap,
  validateTimetableTimeRange,
} from './timetable-time';

export type TimetableIntervalConflictKind = 'classroom' | 'teacher' | 'room';

export interface TimetableIntervalConflictSource {
  identity: string;
  schoolId: string;
  termId: string;
  timetableConfigId: string;
  entryId: string | null;
  proposedIndex: number | null;
  classroomId: string;
  teacherUserId: string;
  roomId: string | null;
  dayOfWeek: number;
  periodId: string;
  startTime: string;
  endTime: string;
}

export interface TimetableIntervalConflictPair {
  kind: TimetableIntervalConflictKind;
  first: TimetableIntervalConflictSource;
  second: TimetableIntervalConflictSource;
}

export interface ComputedTimetableConflict {
  id: string;
  conflictType: TimetableConflictType;
  severity: TimetableConflictSeverity;
  status: TimetableConflictStatus;
  dayOfWeek: number | null;
  periodId: string | null;
  entryId: string | null;
  relatedEntryId: string | null;
  entryIds: string[];
  teacherUserId: string | null;
  roomId: string | null;
  message: string;
}

export function timetableEntryToConflictSource(
  entry: TimetableEntryRecord,
): TimetableIntervalConflictSource {
  return {
    identity: `entry:${entry.id}`,
    schoolId: entry.schoolId,
    termId: entry.termId,
    timetableConfigId: entry.timetableConfigId,
    entryId: entry.id,
    proposedIndex: null,
    classroomId: entry.classroomId,
    teacherUserId: entry.teacherUserId,
    roomId: entry.roomId ?? null,
    dayOfWeek: entry.dayOfWeek,
    periodId: entry.periodId,
    startTime: entry.period.startTime,
    endTime: entry.period.endTime,
  };
}

export function findTimetableIntervalConflicts(
  sources: TimetableIntervalConflictSource[],
): TimetableIntervalConflictPair[] {
  const ordered = [...sources].sort((left, right) =>
    left.identity.localeCompare(right.identity),
  );
  const rangedSources = ordered.map((source) => ({
    source,
    range: validateTimetableTimeRange(source),
  }));
  const conflicts: TimetableIntervalConflictPair[] = [];

  for (let firstIndex = 0; firstIndex < rangedSources.length; firstIndex += 1) {
    const first = rangedSources[firstIndex];
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < rangedSources.length;
      secondIndex += 1
    ) {
      const second = rangedSources[secondIndex];
      if (
        first.source.schoolId !== second.source.schoolId ||
        first.source.termId !== second.source.termId ||
        first.source.dayOfWeek !== second.source.dayOfWeek ||
        !timetableTimeRangesOverlap(first.range, second.range)
      ) {
        continue;
      }

      if (first.source.classroomId === second.source.classroomId) {
        conflicts.push({
          kind: 'classroom',
          first: first.source,
          second: second.source,
        });
      }
      if (first.source.teacherUserId === second.source.teacherUserId) {
        conflicts.push({
          kind: 'teacher',
          first: first.source,
          second: second.source,
        });
      }
      if (first.source.roomId && first.source.roomId === second.source.roomId) {
        conflicts.push({
          kind: 'room',
          first: first.source,
          second: second.source,
        });
      }
    }
  }

  return conflicts;
}

export function computeTimetableConflicts(
  entries: TimetableEntryRecord[],
): ComputedTimetableConflict[] {
  const sources = entries
    .filter((entry) => entry.status !== TimetableEntryStatus.CANCELLED)
    .map(timetableEntryToConflictSource);

  return findTimetableIntervalConflicts(sources).map(buildConflict);
}

function buildConflict(
  conflict: TimetableIntervalConflictPair,
): ComputedTimetableConflict {
  const { kind, first, second } = conflict;
  const type =
    kind === 'classroom'
      ? TimetableConflictType.CLASSROOM_SLOT
      : kind === 'teacher'
        ? TimetableConflictType.TEACHER
        : TimetableConflictType.ROOM;
  const entryIds = [first.entryId, second.entryId].filter(
    (entryId): entryId is string => entryId !== null,
  );

  return {
    id: `computed:${type}:${first.identity}:${second.identity}`,
    conflictType: type,
    severity: TimetableConflictSeverity.BLOCKING,
    status: TimetableConflictStatus.OPEN,
    dayOfWeek: first.dayOfWeek,
    periodId: first.periodId,
    entryId: first.entryId,
    relatedEntryId: second.entryId,
    entryIds,
    teacherUserId: kind === 'teacher' ? first.teacherUserId : null,
    roomId: kind === 'room' ? first.roomId : null,
    message: timetableConflictMessage(kind),
  };
}

export function timetableConflictMessage(
  kind: TimetableIntervalConflictKind,
): string {
  if (kind === 'classroom') {
    return 'Classroom has overlapping timetable entries.';
  }
  if (kind === 'teacher') {
    return 'Teacher is assigned to overlapping timetable entries.';
  }
  return 'Room is assigned to overlapping timetable entries.';
}
