import { TimetableEntryStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertConfigMutable,
  assertTermWritable,
  classroomMatchesTimetableConfigScope,
} from '../domain/timetable-policy';
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
  TimetableRoomConflictException,
  TimetableRoomNotFoundException,
  TimetableTeacherConflictException,
} from '../domain/timetable.exceptions';
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

export interface TimetableConflictSource {
  kind: 'existing' | 'proposed';
  entryId: string | null;
  proposedIndex: number | null;
  classroomId: string;
  teacherUserId: string;
  roomId: string | null;
  dayOfWeek: number;
  periodId: string;
  periodKey: string;
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
    const resolved = await resolveTimetableBulkItem(repository, term, item, index);
    const matrixRow = await repository.findSubjectAllocationByKey({
      termId: term.id,
      gradeId: resolved.gradeId,
      subjectId: resolved.subjectId,
    });

    if (!matrixRow) {
      const issue = conflictIssue({
        code: 'missing_subject_allocation',
        message:
          'Subject allocation weekly-hours row is missing for this timetable slot.',
        severity: 'blocking',
        dayOfWeek: resolved.dayOfWeek,
        periodId: resolved.periodId,
        classroomId: resolved.classroomId,
        teacherUserId: resolved.teacherUserId,
        roomId: resolved.roomId,
        proposedIndexes: [index],
      });
      if (!options?.collectIssues) {
        throw new TimetableMissingSubjectAllocationException({
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
  const proposedSlotKeys = new Set(
    input.proposedItems.map((item) => timetableSlotKey(item)),
  );
  const existingSources = input.existingEntries
    .filter((entry) => entry.status !== TimetableEntryStatus.CANCELLED)
    .filter((entry) => !proposedSlotKeys.has(timetableSlotKey(entry)))
    .map(existingEntryToConflictSource);
  const proposedSources = input.proposedItems.map(proposedItemToConflictSource);

  return [
    ...(input.issues ?? []),
    ...findGroupedConflictItems([...existingSources, ...proposedSources]),
  ];
}

export function throwIfBlockingTimetableConflicts(
  conflicts: TimetableConflictCheckItemDto[],
): void {
  const first = conflicts[0];
  if (!first) return;
  const details = conflictDetails(first);

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

export function subjectAllocationKey(gradeId: string, subjectId: string): string {
  return `${gradeId}:${subjectId}`;
}

export function timetableSlotKey(input: {
  classroomId: string;
  dayOfWeek: number;
  periodId: string;
}): string {
  return `${input.classroomId}:${input.dayOfWeek}:${input.periodId}`;
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

export function matrixByGradeSubject(
  rows: TimetableSubjectAllocationRecord[],
): Map<string, TimetableSubjectAllocationRecord> {
  return new Map(
    rows.map((row) => [subjectAllocationKey(row.gradeId, row.subjectId), row]),
  );
}

function findGroupedConflictItems(
  sources: TimetableConflictSource[],
): TimetableConflictCheckItemDto[] {
  return [
    ...findConflictGroup(sources, 'classroom_conflict', (source) =>
      source.classroomId,
    ),
    ...findConflictGroup(sources, 'teacher_conflict', (source) =>
      source.teacherUserId,
    ),
    ...findConflictGroup(sources, 'room_conflict', (source) => source.roomId),
  ];
}

function findConflictGroup(
  sources: TimetableConflictSource[],
  code: 'classroom_conflict' | 'teacher_conflict' | 'room_conflict',
  getResourceId: (source: TimetableConflictSource) => string | null,
): TimetableConflictCheckItemDto[] {
  const groups = new Map<string, TimetableConflictSource[]>();
  for (const source of sources) {
    const resourceId = getResourceId(source);
    if (!resourceId) continue;

    const key = `${source.dayOfWeek}:${source.periodKey}:${resourceId}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }

  const conflicts: TimetableConflictCheckItemDto[] = [];
  for (const group of groups.values()) {
    if (
      group.length < 2 ||
      !group.some((source) => source.kind === 'proposed')
    ) {
      continue;
    }

    conflicts.push(
      conflictIssue({
        code,
        message: messageForConflictCode(code),
        severity: 'blocking',
        dayOfWeek: group[0].dayOfWeek,
        periodId: group[0].periodId,
        classroomId:
          code === 'classroom_conflict' ? group[0].classroomId : null,
        teacherUserId:
          code === 'teacher_conflict' ? group[0].teacherUserId : null,
        roomId: code === 'room_conflict' ? group[0].roomId : null,
        entryIds: group
          .map((source) => source.entryId)
          .filter((entryId): entryId is string => Boolean(entryId)),
        proposedIndexes: group
          .map((source) => source.proposedIndex)
          .filter((index): index is number => index !== null),
      }),
    );
  }

  return conflicts;
}

async function resolveTimetableBulkItem(
  repository: TimetableRepository,
  term: TimetableTermRecord,
  item: TimetableBulkEntryItemDto,
  index: number,
): Promise<ResolvedTimetableBulkItem> {
  assertTermWritable(term);

  const period = await repository.findPeriodById(item.periodId);
  if (!period) {
    throw new TimetablePeriodNotFoundException({ index, periodId: item.periodId });
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
  if (roomId) {
    const room = await repository.findRoomById(roomId);
    if (!room) {
      throw new TimetableRoomNotFoundException({ index, roomId });
    }
  }

  return {
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

function existingEntryToConflictSource(
  entry: TimetableEntryRecord,
): TimetableConflictSource {
  return {
    kind: 'existing',
    entryId: entry.id,
    proposedIndex: null,
    classroomId: entry.classroomId,
    teacherUserId: entry.teacherUserId,
    roomId: entry.roomId ?? null,
    dayOfWeek: entry.dayOfWeek,
    periodId: entry.periodId,
    periodKey: periodKey(entry.period),
  };
}

function proposedItemToConflictSource(
  item: ResolvedTimetableBulkItem,
): TimetableConflictSource {
  return {
    kind: 'proposed',
    entryId: null,
    proposedIndex: item.index,
    classroomId: item.classroomId,
    teacherUserId: item.teacherUserId,
    roomId: item.roomId,
    dayOfWeek: item.dayOfWeek,
    periodId: item.periodId,
    periodKey: periodKey(item.period),
  };
}

function periodKey(period: { startTime: string; endTime: string }): string {
  return `${period.startTime}-${period.endTime}`;
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

function messageForConflictCode(
  code: 'classroom_conflict' | 'teacher_conflict' | 'room_conflict',
): string {
  if (code === 'classroom_conflict') {
    return 'Classroom has more than one timetable entry in this period.';
  }
  if (code === 'teacher_conflict') {
    return 'Teacher is assigned to more than one timetable entry in this period.';
  }
  return 'Room is assigned to more than one timetable entry in this period.';
}
