import { TimetableEntryStatus } from '@prisma/client';
import { RoomSchedulingEligibility } from '../../rooms/domain/room-scheduling.policy';
import { isActiveCurriculumRequirement } from '../../subject-allocation/domain/active-curriculum.policy';
import { SubjectNotTaughtException } from '../../subject-allocation/domain/subject-allocation.exceptions';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertConfigMutable,
  assertTermWritable,
  classroomMatchesTimetableConfigScope,
} from '../domain/timetable-policy';
import {
  findTimetableIntervalConflicts,
  timetableConflictMessage,
  timetableEntryToConflictSource,
  TimetableIntervalConflictSource,
} from '../domain/timetable-conflicts';
import {
  TimetableAllocationMismatchException,
  TimetableAllocationNotFoundException,
  TimetableClassroomNotFoundException,
  TimetableClassroomScopeMismatchException,
  TimetableDuplicateSlotException,
  TimetableEntryConflictException,
  TimetableInvalidBulkSizeException,
  TimetableInvalidDayException,
  TimetableInvalidTeacherAllocationException,
  TimetableMissingSubjectAllocationException,
  TimetablePeriodNotFoundException,
  TimetablePeriodNotInConfigException,
  TimetableRoomCapacityInsufficientException,
  TimetableRoomConflictException,
  TimetableRoomInactiveException,
  TimetableRoomNotFoundException,
  TimetableTeacherConflictException,
} from '../domain/timetable.exceptions';
import { evaluateTimetableRoomScheduling } from '../domain/timetable-room-scheduling';
import {
  BulkTimetableEntryInput,
  TimetableClassroomRecord,
  TimetableConfigRecord,
  TimetableEntryRecord,
  TimetableGradeRecord,
  TimetablePeriodRecord,
  TimetableRepository,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
  TimetableTermRecord,
} from '../infrastructure/timetable.repository';
import { TimetableBulkEntryItemDto } from '../dto/timetable.dto';
import { TimetableConflictCheckItemDto } from '../dto/timetable-response.dto';

export const MAX_TIMETABLE_BULK_ITEMS = 1000;

export interface ResolvedTimetableBulkItem extends BulkTimetableEntryInput {
  index: number;
  period: TimetablePeriodRecord;
  config: TimetableConfigRecord;
}

interface ResolvedTimetableBulkItemResult {
  resolved: ResolvedTimetableBulkItem;
  roomEligibility: RoomSchedulingEligibility | null;
  roomCapacity: number | null;
  classroomCapacity: number | null;
}

export async function resolveReadableTimetableContext(
  repository: TimetableRepository,
  input: {
    termId: string;
    gradeId?: string;
    classroomId?: string;
  },
): Promise<{
  term: TimetableTermRecord;
  grade: TimetableGradeRecord | null;
  classroom: TimetableClassroomRecord | null;
}> {
  const term = await repository.findTermById(input.termId);
  if (!term) {
    throw new NotFoundDomainException('Term not found', {
      termId: input.termId,
    });
  }

  const grade = input.gradeId
    ? await repository.findGradeById(input.gradeId)
    : null;
  if (input.gradeId && !grade) {
    throw new TimetableClassroomNotFoundException({ gradeId: input.gradeId });
  }

  const classroom = input.classroomId
    ? await repository.findClassroomById(input.classroomId)
    : null;
  if (input.classroomId && !classroom) {
    throw new TimetableClassroomNotFoundException({
      classroomId: input.classroomId,
    });
  }
  if (grade && classroom && classroom.section.gradeId !== grade.id) {
    throw new TimetableClassroomNotFoundException({
      classroomId: classroom.id,
      gradeId: grade.id,
    });
  }

  return { term, grade, classroom };
}

export function assertValidTimetableBulkSize(items: unknown[]): void {
  if (items.length === 0 || items.length > MAX_TIMETABLE_BULK_ITEMS) {
    throw new TimetableInvalidBulkSizeException({
      min: 1,
      max: MAX_TIMETABLE_BULK_ITEMS,
      actual: items.length,
    });
  }
}

export function assertNoDuplicateTimetableSlots(
  items: TimetableBulkEntryItemDto[],
): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const key = timetableSlotKey({
      classroomId: item.classroomId,
      dayOfWeek: item.dayOfWeek,
      periodId: item.periodId,
    });
    if (seen.has(key)) {
      throw new TimetableDuplicateSlotException({ index, key });
    }
    seen.add(key);
  }
}

export async function resolveTimetableBulkItems(
  repository: TimetableRepository,
  term: TimetableTermRecord,
  items: TimetableBulkEntryItemDto[],
  options?: { collectIssues?: boolean },
): Promise<{
  resolvedItems: ResolvedTimetableBulkItem[];
  issues: TimetableConflictCheckItemDto[];
}> {
  const resolvedItems: ResolvedTimetableBulkItem[] = [];
  const issues: TimetableConflictCheckItemDto[] = [];

  for (const [index, item] of items.entries()) {
    const result = await resolveTimetableBulkItem(
      repository,
      term,
      item,
      index,
    );
    const resolved = result.resolved;
    if (result.roomEligibility && !result.roomEligibility.eligible) {
      const eligibility = result.roomEligibility;
      if (eligibility.reason === 'room_not_found') {
        throw new TimetableRoomNotFoundException({
          index,
          roomId: resolved.roomId,
        });
      }

      const roomIssue = conflictIssue({
        code: eligibility.reason,
        message:
          eligibility.reason === 'room_inactive'
            ? 'Room is not available for timetable scheduling.'
            : 'Room capacity is insufficient for this classroom.',
        severity: 'blocking',
        dayOfWeek: resolved.dayOfWeek,
        periodId: resolved.periodId,
        classroomId: resolved.classroomId,
        teacherUserId: resolved.teacherUserId,
        roomId: resolved.roomId,
        proposedIndexes: [index],
      });
      if (!options?.collectIssues) {
        if (eligibility.reason === 'room_inactive') {
          throw new TimetableRoomInactiveException({
            index,
            roomId: resolved.roomId,
          });
        }
        throw new TimetableRoomCapacityInsufficientException({
          index,
          roomId: resolved.roomId,
          roomCapacity: result.roomCapacity,
          classroomId: resolved.classroomId,
          classroomCapacity: result.classroomCapacity,
        });
      }
      issues.push(roomIssue);
    }
    const matrixRow = await repository.findSubjectAllocationByKey({
      termId: term.id,
      gradeId: resolved.gradeId,
      subjectId: resolved.subjectId,
    });

    if (!isActiveCurriculumRequirement(matrixRow)) {
      const issue = conflictIssue({
        code: matrixRow ? 'subject_not_taught' : 'missing_subject_allocation',
        message: matrixRow
          ? 'Subject is not taught for this timetable slot.'
          : 'Subject allocation weekly-hours row is missing for this timetable slot.',
        severity: 'blocking',
        dayOfWeek: resolved.dayOfWeek,
        periodId: resolved.periodId,
        classroomId: resolved.classroomId,
        teacherUserId: resolved.teacherUserId,
        roomId: resolved.roomId,
        proposedIndexes: [index],
      });
      if (!options?.collectIssues) {
        const Exception = matrixRow
          ? SubjectNotTaughtException
          : TimetableMissingSubjectAllocationException;
        throw new Exception({
          index,
          termId: term.id,
          gradeId: resolved.gradeId,
          subjectId: resolved.subjectId,
        });
      }
      issues.push(issue);
    }

    resolvedItems.push(resolved);
  }

  return { resolvedItems, issues };
}

export function buildTimetableConflictCheckItems(input: {
  existingEntries: TimetableEntryRecord[];
  proposedItems: ResolvedTimetableBulkItem[];
  issues?: TimetableConflictCheckItemDto[];
}): TimetableConflictCheckItemDto[] {
  const proposedIdentityKeys = new Set(
    input.proposedItems.map((item) => timetableBulkUpsertIdentityKey(item)),
  );
  const replacedEntryIds = new Set<string>();
  for (const key of proposedIdentityKeys) {
    const replacedEntry = input.existingEntries
      .filter((entry) => timetableBulkUpsertIdentityKey(entry) === key)
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      )[0];
    if (replacedEntry) replacedEntryIds.add(replacedEntry.id);
  }
  const existingSources = input.existingEntries
    .filter((entry) => entry.status !== TimetableEntryStatus.CANCELLED)
    .filter((entry) => !replacedEntryIds.has(entry.id))
    .map(timetableEntryToConflictSource);
  const proposedSources = input.proposedItems.map(proposedItemToConflictSource);

  const conflictItems = findTimetableIntervalConflicts([
    ...existingSources,
    ...proposedSources,
  ])
    .filter(
      (conflict) =>
        conflict.first.proposedIndex !== null ||
        conflict.second.proposedIndex !== null,
    )
    .sort(
      (left, right) =>
        conflictKindPriority(left.kind) - conflictKindPriority(right.kind),
    )
    .map((conflict) => {
      const proposal =
        conflict.first.proposedIndex !== null
          ? conflict.first
          : conflict.second;
      return conflictIssue({
        code: `${conflict.kind}_conflict`,
        message: timetableConflictMessage(conflict.kind),
        severity: 'blocking',
        dayOfWeek: proposal.dayOfWeek,
        periodId: proposal.periodId,
        classroomId:
          conflict.kind === 'classroom' ? proposal.classroomId : null,
        teacherUserId:
          conflict.kind === 'teacher' ? proposal.teacherUserId : null,
        roomId: conflict.kind === 'room' ? proposal.roomId : null,
        entryIds: [conflict.first.entryId, conflict.second.entryId]
          .filter((entryId): entryId is string => entryId !== null)
          .sort(),
        proposedIndexes: [
          conflict.first.proposedIndex,
          conflict.second.proposedIndex,
        ]
          .filter((index): index is number => index !== null)
          .sort((left, right) => left - right),
      });
    });

  return [...(input.issues ?? []), ...conflictItems];
}

export function throwIfBlockingTimetableConflicts(
  conflicts: TimetableConflictCheckItemDto[],
): void {
  const first = conflicts[0];
  if (!first) return;
  const details = conflictDetails(first);

  if (first.code === 'subject_not_taught') {
    throw new SubjectNotTaughtException(details);
  }
  if (first.code === 'missing_subject_allocation') {
    throw new TimetableMissingSubjectAllocationException(details);
  }
  if (first.code === 'invalid_teacher_allocation') {
    throw new TimetableInvalidTeacherAllocationException(details);
  }
  if (first.code === 'teacher_conflict') {
    throw new TimetableTeacherConflictException(details);
  }
  if (first.code === 'room_conflict') {
    throw new TimetableRoomConflictException(details);
  }

  throw new TimetableEntryConflictException(details);
}

export function subjectAllocationKey(
  gradeId: string,
  subjectId: string,
): string {
  return `${gradeId}:${subjectId}`;
}

export function timetableSlotKey(input: {
  classroomId: string;
  dayOfWeek: number;
  periodId: string;
}): string {
  return `${input.classroomId}:${input.dayOfWeek}:${input.periodId}`;
}

/** Mirrors TimetableRepository.bulkUpsertEntries replacement lookup. */
export function timetableBulkUpsertIdentityKey(input: {
  schoolId: string;
  termId: string;
  classroomId: string;
  dayOfWeek: number;
  periodId: string;
}): string {
  return `${input.schoolId}:${input.termId}:${input.classroomId}:${input.dayOfWeek}:${input.periodId}`;
}

export function groupBy<T>(
  items: T[],
  getKey: (item: T) => string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    result.set(key, [...(result.get(key) ?? []), item]);
  }
  return result;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function conflictKindPriority(kind: 'classroom' | 'teacher' | 'room'): number {
  if (kind === 'classroom') return 0;
  if (kind === 'teacher') return 1;
  return 2;
}

export function matrixByGradeSubject(
  rows: TimetableSubjectAllocationRecord[],
): Map<string, TimetableSubjectAllocationRecord> {
  return new Map(
    rows.map((row) => [subjectAllocationKey(row.gradeId, row.subjectId), row]),
  );
}

async function resolveTimetableBulkItem(
  repository: TimetableRepository,
  term: TimetableTermRecord,
  item: TimetableBulkEntryItemDto,
  index: number,
): Promise<ResolvedTimetableBulkItemResult> {
  assertTermWritable(term);

  const period = await repository.findPeriodById(item.periodId);
  if (!period) {
    throw new TimetablePeriodNotFoundException({
      index,
      periodId: item.periodId,
    });
  }

  const config = await repository.findConfigById(period.timetableConfigId);
  if (!config || config.termId !== term.id) {
    throw new TimetablePeriodNotInConfigException({
      index,
      termId: term.id,
      periodId: item.periodId,
    });
  }
  assertConfigMutable(config);

  if (!config.activeDays.includes(item.dayOfWeek)) {
    throw new TimetableInvalidDayException({
      index,
      timetableConfigId: config.id,
      dayOfWeek: item.dayOfWeek,
      activeDays: config.activeDays,
    });
  }

  const classroom = await repository.findClassroomById(item.classroomId);
  if (!classroom) {
    throw new TimetableClassroomNotFoundException({
      index,
      classroomId: item.classroomId,
    });
  }
  if (!classroomMatchesTimetableConfigScope(config, classroom)) {
    throw new TimetableClassroomScopeMismatchException({
      index,
      timetableConfigId: config.id,
      classroomId: classroom.id,
      scopeType: config.scopeType,
    });
  }

  const allocation = await repository.findTeacherAllocationById(
    item.teacherSubjectAllocationId,
  );
  if (!allocation) {
    throw new TimetableAllocationNotFoundException({
      index,
      teacherSubjectAllocationId: item.teacherSubjectAllocationId,
    });
  }
  assertTeacherAllocationMatchesItem(allocation, item, term.id, index);

  const roomId = item.roomId ?? null;
  let roomEligibility: RoomSchedulingEligibility | null = null;
  let roomCapacity: number | null = null;
  if (roomId) {
    const room = await repository.findRoomById(roomId);
    roomEligibility = evaluateTimetableRoomScheduling(room, classroom);
    roomCapacity = room?.capacity ?? null;
  }

  return {
    resolved: {
      index,
      schoolId: config.schoolId,
      academicYearId: config.academicYearId,
      termId: term.id,
      timetableConfigId: config.id,
      periodId: period.id,
      dayOfWeek: item.dayOfWeek,
      gradeId: classroom.section.gradeId,
      sectionId: classroom.sectionId,
      classroomId: classroom.id,
      subjectId: allocation.subjectId,
      teacherUserId: allocation.teacherUserId,
      teacherSubjectAllocationId: allocation.id,
      roomId,
      period,
      config,
    },
    roomEligibility,
    roomCapacity,
    classroomCapacity: classroom.capacity,
  };
}

function assertTeacherAllocationMatchesItem(
  allocation: TimetableTeacherAllocationRecord,
  item: TimetableBulkEntryItemDto,
  termId: string,
  index: number,
): void {
  if (
    allocation.termId !== termId ||
    allocation.classroomId !== item.classroomId
  ) {
    throw new TimetableAllocationMismatchException({
      index,
      termId,
      classroomId: item.classroomId,
      teacherSubjectAllocationId: allocation.id,
    });
  }
}

function proposedItemToConflictSource(
  item: ResolvedTimetableBulkItem,
): TimetableIntervalConflictSource {
  return {
    identity: `proposed:${item.index.toString().padStart(6, '0')}`,
    schoolId: item.schoolId,
    termId: item.termId,
    timetableConfigId: item.timetableConfigId,
    entryId: null,
    proposedIndex: item.index,
    classroomId: item.classroomId,
    teacherUserId: item.teacherUserId,
    roomId: item.roomId,
    dayOfWeek: item.dayOfWeek,
    periodId: item.periodId,
    startTime: item.period.startTime,
    endTime: item.period.endTime,
  };
}

function conflictIssue(input: {
  code: string;
  message: string;
  severity: string;
  dayOfWeek?: number | null;
  periodId?: string | null;
  classroomId?: string | null;
  teacherUserId?: string | null;
  roomId?: string | null;
  entryIds?: string[];
  proposedIndexes?: number[];
}): TimetableConflictCheckItemDto {
  return {
    code: input.code,
    message: input.message,
    severity: input.severity,
    dayOfWeek: input.dayOfWeek ?? null,
    periodId: input.periodId ?? null,
    classroomId: input.classroomId ?? null,
    teacherUserId: input.teacherUserId ?? null,
    roomId: input.roomId ?? null,
    entryIds: input.entryIds ?? [],
    proposedIndexes: input.proposedIndexes ?? [],
  };
}

function conflictDetails(
  conflict: TimetableConflictCheckItemDto,
): Record<string, unknown> {
  return {
    code: conflict.code,
    dayOfWeek: conflict.dayOfWeek,
    periodId: conflict.periodId,
    classroomId: conflict.classroomId,
    teacherUserId: conflict.teacherUserId,
    roomId: conflict.roomId,
    entryIds: conflict.entryIds,
    proposedIndexes: conflict.proposedIndexes,
  };
}
