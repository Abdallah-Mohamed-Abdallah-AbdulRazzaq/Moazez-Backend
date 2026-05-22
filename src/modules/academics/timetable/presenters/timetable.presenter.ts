import {
  TimetableConfigRecord,
  TimetableConflictRecord,
  TimetableEntryRecord,
  TimetablePeriodRecord,
} from '../infrastructure/timetable.repository';
import {
  TimetableConfigResponseDto,
  TimetableConflictResponseDto,
  TimetableConflictsListResponseDto,
  TimetablePeriodResponseDto,
  TimetablePeriodsListResponseDto,
  TimetablePreviewEntryDto,
  TimetablePreviewResponseDto,
} from '../dto/timetable-response.dto';
import { ComputedTimetableConflict } from '../domain/timetable-conflicts';

export function presentTimetableConfig(
  config: TimetableConfigRecord,
): TimetableConfigResponseDto {
  return {
    id: config.id,
    academicYearId: config.academicYearId,
    termId: config.termId,
    name: config.name,
    weekStartDay: config.weekStartDay,
    activeDays: config.activeDays,
    scopeType: config.scopeType.toLowerCase(),
    scopeKey: config.scopeKey,
    gradeId: config.gradeId ?? null,
    sectionId: config.sectionId ?? null,
    classroomId: config.classroomId ?? null,
    status: config.status.toLowerCase(),
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function presentTimetablePeriod(
  period: TimetablePeriodRecord,
): TimetablePeriodResponseDto {
  return {
    id: period.id,
    timetableConfigId: period.timetableConfigId,
    index: period.periodIndex,
    label: period.label,
    startTime: period.startTime,
    endTime: period.endTime,
    timeRange: `${period.startTime} - ${period.endTime}`,
    type: period.type.toLowerCase(),
    isInstructional: period.isInstructional,
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
  };
}

export function presentTimetablePeriods(
  periods: TimetablePeriodRecord[],
): TimetablePeriodsListResponseDto {
  return {
    items: periods.map((period) => presentTimetablePeriod(period)),
  };
}

export function presentPreviewEntry(
  entry: TimetableEntryRecord,
): TimetablePreviewEntryDto {
  return {
    id: entry.id,
    dayOfWeek: entry.dayOfWeek,
    periodId: entry.periodId,
    periodIndex: entry.period.periodIndex,
    classroomId: entry.classroomId,
    subjectId: entry.subjectId,
    teacherUserId: entry.teacherUserId,
    teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
    roomId: entry.roomId ?? null,
    notes: entry.notes ?? null,
    status: entry.status.toLowerCase(),
  };
}

export function presentTimetableConflict(
  conflict: TimetableConflictRecord | ComputedTimetableConflict,
): TimetableConflictResponseDto {
  return {
    id: conflict.id,
    type: conflict.conflictType.toLowerCase(),
    severity: conflict.severity.toLowerCase(),
    status: conflict.status.toLowerCase(),
    dayOfWeek: conflict.dayOfWeek ?? null,
    periodId: conflict.periodId ?? null,
    entryId: conflict.entryId ?? null,
    relatedEntryId: conflict.relatedEntryId ?? null,
    teacherUserId: conflict.teacherUserId ?? null,
    roomId: conflict.roomId ?? null,
    message: conflict.message,
  };
}

export function presentTimetableConflicts(
  conflicts: Array<TimetableConflictRecord | ComputedTimetableConflict>,
): TimetableConflictsListResponseDto {
  return {
    items: conflicts.map((conflict) => presentTimetableConflict(conflict)),
  };
}

export function presentTimetablePreview(input: {
  config: TimetableConfigRecord;
  periods: TimetablePeriodRecord[];
  entries: TimetableEntryRecord[];
  conflicts: Array<TimetableConflictRecord | ComputedTimetableConflict>;
}): TimetablePreviewResponseDto {
  return {
    config: presentTimetableConfig(input.config),
    periods: input.periods.map((period) => presentTimetablePeriod(period)),
    activeDays: input.config.activeDays,
    entries: input.entries.map((entry) => presentPreviewEntry(entry)),
    conflicts: input.conflicts.map((conflict) =>
      presentTimetableConflict(conflict),
    ),
  };
}
