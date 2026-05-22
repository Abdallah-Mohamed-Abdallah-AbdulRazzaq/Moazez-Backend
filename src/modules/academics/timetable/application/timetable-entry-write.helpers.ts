import { TimetableEntryStatus, TimetableScopeType } from '@prisma/client';
import {
  assertConfigMutable,
  assertTermWritable,
} from '../domain/timetable-policy';
import {
  TimetableAllocationNotFoundException,
  TimetableAllocationMismatchException,
  TimetableClassroomNotFoundException,
  TimetableClassroomScopeMismatchException,
  TimetableConfigNotFoundException,
  TimetableEntryConflictException,
  TimetableInvalidDayException,
  TimetablePeriodNotFoundException,
  TimetablePeriodNotInConfigException,
  TimetableRoomConflictException,
  TimetableRoomNotFoundException,
  TimetableTeacherConflictException,
} from '../domain/timetable.exceptions';
import {
  TimetableClassroomRecord,
  TimetableConfigRecord,
  TimetableEntryRecord,
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

  const roomId = command.roomId ?? null;
  if (roomId) {
    const room = await repository.findRoomById(roomId);
    if (!room) {
      throw new TimetableRoomNotFoundException({ roomId });
    }
  }

  await assertNoBlockingEntryConflict(repository, {
    timetableConfigId: config.id,
    periodId: period.id,
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
  if (config.scopeType === TimetableScopeType.TERM) {
    return;
  }

  const matchesScope =
    (config.scopeType === TimetableScopeType.GRADE &&
      classroom.section.gradeId === config.gradeId) ||
    (config.scopeType === TimetableScopeType.SECTION &&
      classroom.sectionId === config.sectionId) ||
    (config.scopeType === TimetableScopeType.CLASSROOM &&
      classroom.id === config.classroomId);

  if (!matchesScope) {
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
    timetableConfigId: string;
    periodId: string;
    dayOfWeek: number;
    classroomId: string;
    teacherUserId: string;
    roomId: string | null;
    excludeEntryId?: string;
  },
): Promise<void> {
  const entries = await repository.listEntriesForConflictWindow({
    timetableConfigId: candidate.timetableConfigId,
    periodId: candidate.periodId,
    dayOfWeek: candidate.dayOfWeek,
    excludeEntryId: candidate.excludeEntryId,
  });
  const activeEntries = entries.filter(
    (entry) => entry.status !== TimetableEntryStatus.CANCELLED,
  );

  const classroomConflict = activeEntries.find(
    (entry) => entry.classroomId === candidate.classroomId,
  );
  if (classroomConflict) {
    throw new TimetableEntryConflictException(
      conflictDetails(candidate, classroomConflict),
    );
  }

  const teacherConflict = activeEntries.find(
    (entry) => entry.teacherUserId === candidate.teacherUserId,
  );
  if (teacherConflict) {
    throw new TimetableTeacherConflictException(
      conflictDetails(candidate, teacherConflict),
    );
  }

  if (!candidate.roomId) {
    return;
  }

  const roomConflict = activeEntries.find(
    (entry) => entry.roomId === candidate.roomId,
  );
  if (roomConflict) {
    throw new TimetableRoomConflictException(
      conflictDetails(candidate, roomConflict),
    );
  }
}

function conflictDetails(
  candidate: {
    timetableConfigId: string;
    periodId: string;
    dayOfWeek: number;
  },
  conflictingEntry: TimetableEntryRecord,
): Record<string, unknown> {
  return {
    timetableConfigId: candidate.timetableConfigId,
    periodId: candidate.periodId,
    dayOfWeek: candidate.dayOfWeek,
    conflictingEntryId: conflictingEntry.id,
  };
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === null || notes === undefined) {
    return null;
  }

  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}
