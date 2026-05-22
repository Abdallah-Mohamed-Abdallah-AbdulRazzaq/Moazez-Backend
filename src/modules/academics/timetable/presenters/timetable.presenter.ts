import {
  TimetableConfigStatus,
  TimetableConflictType,
  TimetablePublicationStatus,
} from '@prisma/client';
import type {
  TimetableConfigRecord,
  TimetableConflictRecord,
  TimetableEntryRecord,
  TimetablePeriodRecord,
  TimetablePublicationRecord,
} from '../infrastructure/timetable.repository';
import type {
  TimetablePublicationResponseDto,
  TimetablePublishReadinessResponseDto,
  TimetableConfigResponseDto,
  TimetableConflictResponseDto,
  TimetableConflictsListResponseDto,
  TimetableEntriesListResponseDto,
  TimetableEntryResponseDto,
  TimetablePeriodResponseDto,
  TimetablePeriodsListResponseDto,
  TimetablePreviewEntryDto,
  TimetablePreviewResponseDto,
} from '../dto/timetable-response.dto';
import type { ComputedTimetableConflict } from '../domain/timetable-conflicts';
import type { TimetablePublishReadiness } from '../application/timetable-publication-readiness';

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

export function presentTimetableEntry(
  entry: TimetableEntryRecord,
): TimetableEntryResponseDto {
  const teacherName = [entry.teacherUser.firstName, entry.teacherUser.lastName]
    .filter((part) => part.trim().length > 0)
    .join(' ');

  return {
    id: entry.id,
    timetableConfigId: entry.timetableConfigId,
    periodId: entry.periodId,
    dayOfWeek: entry.dayOfWeek,
    period: {
      id: entry.period.id,
      index: entry.period.periodIndex,
      label: entry.period.label,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
    },
    classroom: {
      id: entry.classroom.id,
      nameAr: entry.classroom.nameAr,
      nameEn: entry.classroom.nameEn,
    },
    subject: {
      id: entry.subject.id,
      nameAr: entry.subject.nameAr,
      nameEn: entry.subject.nameEn,
      code: entry.subject.code ?? null,
    },
    teacher: {
      userId: entry.teacherUser.id,
      fullName: teacherName,
    },
    room: entry.room
      ? {
          id: entry.room.id,
          nameAr: entry.room.nameAr,
          nameEn: entry.room.nameEn,
        }
      : null,
    teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
    notes: entry.notes ?? null,
    status: entry.status.toLowerCase(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function presentTimetableEntries(
  entries: TimetableEntryRecord[],
): TimetableEntriesListResponseDto {
  return {
    items: entries.map((entry) => presentTimetableEntry(entry)),
  };
}

export function presentTimetableConflict(
  conflict: TimetableConflictRecord | ComputedTimetableConflict,
): TimetableConflictResponseDto {
  return {
    id: conflict.id,
    type: presentTimetableConflictType(conflict.conflictType),
    severity: conflict.severity.toLowerCase(),
    status: conflict.status.toLowerCase(),
    dayOfWeek: conflict.dayOfWeek ?? null,
    periodId: conflict.periodId ?? null,
    entryId: conflict.entryId ?? null,
    relatedEntryId: conflict.relatedEntryId ?? null,
    entryIds: presentTimetableConflictEntryIds(conflict),
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
  publishReadiness: TimetablePublishReadiness;
}): TimetablePreviewResponseDto {
  return {
    config: presentTimetableConfig(input.config),
    periods: input.periods.map((period) => presentTimetablePeriod(period)),
    activeDays: input.config.activeDays,
    entries: input.entries.map((entry) => presentPreviewEntry(entry)),
    conflicts: input.conflicts.map((conflict) =>
      presentTimetableConflict(conflict),
    ),
    publishReadiness: presentTimetablePublishReadiness(input.publishReadiness),
  };
}

export function presentTimetablePublishReadiness(
  readiness: TimetablePublishReadiness,
): TimetablePublishReadinessResponseDto {
  return {
    canPublish: readiness.canPublish,
    blockingReasons: readiness.blockingReasons,
    warnings: readiness.warnings,
  };
}

export function presentTimetablePublication(input: {
  config: TimetableConfigRecord;
  publication: TimetablePublicationRecord | null;
  readiness: TimetablePublishReadiness;
}): TimetablePublicationResponseDto {
  return {
    timetableConfigId: input.config.id,
    status: (
      input.publication?.status ??
      (input.config.status === TimetableConfigStatus.ACTIVE
        ? TimetablePublicationStatus.PUBLISHED
        : TimetablePublicationStatus.DRAFT)
    ).toLowerCase(),
    revision: input.publication?.revision ?? 0,
    publishedAt: input.publication?.publishedAt?.toISOString() ?? null,
    publishedByUserId: input.publication?.publishedByUserId ?? null,
    canPublish: input.readiness.canPublish,
    blockingReasons: input.readiness.blockingReasons,
    summary: {
      periodsCount: input.readiness.summary.periodsCount,
      instructionalPeriodsCount:
        input.readiness.summary.instructionalPeriodsCount,
      entriesCount: input.readiness.summary.entriesCount,
      conflictsCount: input.readiness.summary.conflictsCount,
      activeDays: input.readiness.summary.activeDays,
      scopeType: input.readiness.summary.scopeType.toLowerCase(),
      academicYearId: input.readiness.summary.academicYearId,
      termId: input.readiness.summary.termId,
    },
  };
}

function presentTimetableConflictType(type: TimetableConflictType): string {
  if (type === TimetableConflictType.CLASSROOM_SLOT) {
    return 'CLASSROOM';
  }

  return type;
}

function presentTimetableConflictEntryIds(
  conflict: TimetableConflictRecord | ComputedTimetableConflict,
): string[] {
  if ('entryIds' in conflict) {
    return conflict.entryIds;
  }

  return [conflict.entryId, conflict.relatedEntryId].filter(
    (entryId): entryId is string => Boolean(entryId),
  );
}
