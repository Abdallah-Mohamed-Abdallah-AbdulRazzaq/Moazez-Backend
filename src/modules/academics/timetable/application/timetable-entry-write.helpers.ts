import { isActiveCurriculumRequirement } from '../../subject-allocation/domain/active-curriculum.policy';
import { SubjectNotTaughtException } from '../../subject-allocation/domain/subject-allocation.exceptions';
import {
  assertConfigMutable,
  assertTermWritable,
  classroomMatchesTimetableConfigScope,
} from '../domain/timetable-policy';
import {
  TimetableAllocationNotFoundException,
  TimetableAllocationMismatchException,
  TimetableClassroomNotFoundException,
  TimetableClassroomScopeMismatchException,
  TimetableConfigNotFoundException,
  TimetableEntryConflictException,
  TimetableInvalidDayException,
  TimetableMissingSubjectAllocationException,
  TimetablePeriodNotFoundException,
  TimetablePeriodNotInConfigException,
  TimetableRoomConflictException,
  TimetableRoomNotFoundException,
  TimetableTeacherConflictException,
} from '../domain/timetable.exceptions';
import {
  findTimetableIntervalConflicts,
  timetableEntryToConflictSource,
  TimetableIntervalConflictKind,
  TimetableIntervalConflictSource,
} from '../domain/timetable-conflicts';
import {
  TimetableClassroomRecord,
  TimetableConfigRecord,
  TimetableRepository,
} from '../infrastructure/timetable.repository';

export interface TimetableEntryWriteCommand {
  timetableConfigId: string;
  periodId: string;
  dayOfWeek: number;
  classroomId: string;
  teacherSubjectAllocationId: string;
  subjectId?: string;
  roomId?: string | null;
  notes?: string | null;
}

export interface ResolvedTimetableEntryWrite {
  config: TimetableConfigRecord;
  schoolId: string;
  academicYearId: string;
  termId: string;
  periodId: string;
  dayOfWeek: number;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
  teacherUserId: string;
  teacherSubjectAllocationId: string;
  roomId: string | null;
  notes: string | null;
}

export async function resolveTimetableEntryWrite(
  repository: TimetableRepository,
  command: TimetableEntryWriteCommand,
  options?: { excludeEntryId?: string },
): Promise<ResolvedTimetableEntryWrite> {
  const config = await repository.findConfigById(command.timetableConfigId);
  if (!config) {
    throw new TimetableConfigNotFoundException({
      timetableConfigId: command.timetableConfigId,
    });
  }
  assertConfigMutable(config);

  const term = await repository.findTermById(config.termId);
  if (term) assertTermWritable(term);

  const period = await repository.findPeriodById(command.periodId);
  if (!period) {
    throw new TimetablePeriodNotFoundException({ periodId: command.periodId });
  }
  if (period.timetableConfigId !== config.id) {
    throw new TimetablePeriodNotInConfigException({
      timetableConfigId: config.id,
      periodId: period.id,
    });
  }

  if (!config.activeDays.includes(command.dayOfWeek)) {
    throw new TimetableInvalidDayException({
      timetableConfigId: config.id,
      dayOfWeek: command.dayOfWeek,
      activeDays: config.activeDays,
    });
  }

  const classroom = await repository.findClassroomById(command.classroomId);
  if (!classroom) {
    throw new TimetableClassroomNotFoundException({
      classroomId: command.classroomId,
    });
  }
  assertClassroomMatchesConfigScope(config, classroom);

  const allocation = await repository.findTeacherAllocationById(
    command.teacherSubjectAllocationId,
  );
  if (!allocation) {
    throw new TimetableAllocationNotFoundException({
      teacherSubjectAllocationId: command.teacherSubjectAllocationId,
    });
  }
  if (
    allocation.termId !== config.termId ||
    allocation.classroomId !== classroom.id ||
    (command.subjectId !== undefined &&
      command.subjectId !== allocation.subjectId)
  ) {
    throw new TimetableAllocationMismatchException({
      teacherSubjectAllocationId: command.teacherSubjectAllocationId,
      timetableConfigId: config.id,
      classroomId: classroom.id,
    });
  }

  const curriculumKey = {
    termId: config.termId,
    gradeId: classroom.section.gradeId,
    subjectId: allocation.subjectId,
  };
  const curriculum = await repository.findSubjectAllocationByKey(curriculumKey);
  if (!curriculum)
    throw new TimetableMissingSubjectAllocationException(curriculumKey);
  if (!isActiveCurriculumRequirement(curriculum))
    throw new SubjectNotTaughtException(curriculumKey);

  const roomId = command.roomId ?? null;
  if (roomId) {
    const room = await repository.findRoomById(roomId);
    if (!room) {
      throw new TimetableRoomNotFoundException({ roomId });
    }
  }

  await assertNoBlockingEntryConflict(repository, {
    schoolId: config.schoolId,
    termId: config.termId,
    timetableConfigId: config.id,
    periodId: period.id,
    startTime: period.startTime,
    endTime: period.endTime,
    dayOfWeek: command.dayOfWeek,
    classroomId: classroom.id,
    teacherUserId: allocation.teacherUserId,
    roomId,
    excludeEntryId: options?.excludeEntryId,
  });

  return {
    config,
    schoolId: config.schoolId,
    academicYearId: config.academicYearId,
    termId: config.termId,
    periodId: period.id,
    dayOfWeek: command.dayOfWeek,
    gradeId: classroom.section.gradeId,
    sectionId: classroom.sectionId,
    classroomId: classroom.id,
    subjectId: allocation.subjectId,
    teacherUserId: allocation.teacherUserId,
    teacherSubjectAllocationId: allocation.id,
    roomId,
    notes: normalizeNotes(command.notes),
  };
}

function assertClassroomMatchesConfigScope(
  config: TimetableConfigRecord,
  classroom: TimetableClassroomRecord,
): void {
  if (!classroomMatchesTimetableConfigScope(config, classroom)) {
    throw new TimetableClassroomScopeMismatchException({
      timetableConfigId: config.id,
      classroomId: classroom.id,
      scopeType: config.scopeType,
    });
  }
}

async function assertNoBlockingEntryConflict(
  repository: TimetableRepository,
  candidate: {
    schoolId: string;
    termId: string;
    timetableConfigId: string;
    periodId: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number;
    classroomId: string;
    teacherUserId: string;
    roomId: string | null;
    excludeEntryId?: string;
  },
): Promise<void> {
  const entries = await repository.listEntriesForConflictWindow({
    termId: candidate.termId,
    dayOfWeek: candidate.dayOfWeek,
    classroomId: candidate.classroomId,
    teacherUserId: candidate.teacherUserId,
    roomId: candidate.roomId,
    excludeEntryId: candidate.excludeEntryId,
  });
  const candidateSource: TimetableIntervalConflictSource = {
    identity: 'candidate',
    schoolId: candidate.schoolId,
    termId: candidate.termId,
    timetableConfigId: candidate.timetableConfigId,
    entryId: null,
    proposedIndex: 0,
    classroomId: candidate.classroomId,
    teacherUserId: candidate.teacherUserId,
    roomId: candidate.roomId,
    dayOfWeek: candidate.dayOfWeek,
    periodId: candidate.periodId,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
  };
  const conflicts = findTimetableIntervalConflicts([
    candidateSource,
    ...entries.map(timetableEntryToConflictSource),
  ]).filter(
    (item) =>
      item.first.identity === candidateSource.identity ||
      item.second.identity === candidateSource.identity,
  );
  const conflict = (['classroom', 'teacher', 'room'] as const)
    .map((kind) => conflicts.find((item) => item.kind === kind))
    .find((item) => item !== undefined);
  if (!conflict) return;

  const conflictingSource =
    conflict.first.identity === candidateSource.identity
      ? conflict.second
      : conflict.first;
  const details = conflictDetails(candidate, conflictingSource.entryId!);
  throwConflict(conflict.kind, details);
}

function conflictDetails(
  candidate: {
    timetableConfigId: string;
    periodId: string;
    dayOfWeek: number;
  },
  conflictingEntryId: string,
): Record<string, unknown> {
  return {
    timetableConfigId: candidate.timetableConfigId,
    periodId: candidate.periodId,
    dayOfWeek: candidate.dayOfWeek,
    conflictingEntryId,
  };
}

function throwConflict(
  kind: TimetableIntervalConflictKind,
  details: Record<string, unknown>,
): never {
  if (kind === 'teacher') throw new TimetableTeacherConflictException(details);
  if (kind === 'room') throw new TimetableRoomConflictException(details);
  throw new TimetableEntryConflictException(details);
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === null || notes === undefined) {
    return null;
  }

  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}
