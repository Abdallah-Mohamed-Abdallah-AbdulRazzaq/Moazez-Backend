import {
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetableScopeType,
} from '@prisma/client';
import { isActiveCurriculumRequirement } from '../../subject-allocation/domain/active-curriculum.policy';
import { ComputedTimetableConflict } from '../domain/timetable-conflicts';
import { classroomMatchesTimetableConfigScope } from '../domain/timetable-policy';
import {
  TimetableAcademicYearRecord,
  TimetableClassroomRecord,
  TimetableConfigRecord,
  TimetableEntryRecord,
  TimetablePeriodRecord,
  TimetableRepository,
  TimetableRoomRecord,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
  TimetableTermRecord,
} from '../infrastructure/timetable.repository';
import {
  AuthoritativeTimetableValidation,
  buildAuthoritativeTimetableValidation,
} from './timetable-validation';

export interface TimetablePublishBlockingReason {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface TimetablePublishReadinessSummary {
  periodsCount: number;
  instructionalPeriodsCount: number;
  entriesCount: number;
  conflictsCount: number;
  activeDays: number[];
  scopeType: TimetableScopeType;
  academicYearId: string;
  termId: string;
}

export interface TimetablePublicationDataset {
  config: TimetableConfigRecord;
  academicYear: TimetableAcademicYearRecord | null;
  term: TimetableTermRecord | null;
  periods: TimetablePeriodRecord[];
  entries: TimetableEntryRecord[];
  allClassrooms: TimetableClassroomRecord[];
  scopeClassrooms: TimetableClassroomRecord[];
  subjectAllocations: TimetableSubjectAllocationRecord[];
  teacherAllocations: TimetableTeacherAllocationRecord[];
  rooms: TimetableRoomRecord[];
  termEntries: TimetableEntryRecord[];
  validation: AuthoritativeTimetableValidation;
  conflicts: ComputedTimetableConflict[];
}

export interface TimetablePublishReadiness {
  canPublish: boolean;
  blockingReasons: TimetablePublishBlockingReason[];
  warnings: TimetablePublishBlockingReason[];
  summary: TimetablePublishReadinessSummary;
}

export async function loadTimetablePublicationDataset(
  repository: TimetableRepository,
  config: TimetableConfigRecord,
): Promise<TimetablePublicationDataset> {
  const [
    academicYear,
    term,
    periods,
    entries,
    allClassrooms,
    subjectAllocations,
    teacherAllocations,
    termEntries,
  ] = await Promise.all([
    repository.findAcademicYearById(config.academicYearId),
    repository.findTermById(config.termId),
    repository.listPeriods(config.id),
    repository.listEntriesForConfig(config.id),
    repository.listClassrooms(),
    repository.listSubjectAllocationsForTerm({ termId: config.termId }),
    repository.listTeacherAllocationsByTerm({ termId: config.termId }),
    repository.listEntriesByTerm({ termId: config.termId }),
  ]);
  const scopeClassrooms = allClassrooms.filter((classroom) =>
    classroomMatchesTimetableConfigScope(config, classroom),
  );
  const gradeIds = unique([
    ...scopeClassrooms.map((classroom) => classroom.section.gradeId),
    ...entries.map((entry) => entry.gradeId),
    ...subjectAllocations.map((allocation) => allocation.gradeId),
  ]);
  const roomIds = unique(
    entries
      .filter(isSchedulableEntry)
      .map((entry) => entry.roomId)
      .filter((roomId): roomId is string => roomId !== null),
  );
  const [grades, rooms] = await Promise.all([
    repository.listGradesByIds(gradeIds),
    repository.findRoomsByIds(roomIds),
  ]);
  const validation = buildAuthoritativeTimetableValidation({
    termId: config.termId,
    academicYearId: config.academicYearId,
    classrooms: scopeClassrooms,
    grades,
    subjectAllocations,
    teacherAllocations,
    entries,
    conflictEntries: termEntries,
    rooms,
  });

  return {
    config,
    academicYear,
    term,
    periods,
    entries,
    allClassrooms,
    scopeClassrooms,
    subjectAllocations,
    teacherAllocations,
    rooms,
    termEntries,
    validation,
    conflicts: validation.conflicts,
  };
}

export function buildTimetablePublishReadiness(
  dataset: TimetablePublicationDataset,
): TimetablePublishReadiness {
  const blockingReasons: TimetablePublishBlockingReason[] = [];
  const instructionalPeriods = dataset.periods.filter(
    (period) => period.isInstructional,
  );
  const schedulableEntries = dataset.entries.filter(isSchedulableEntry);

  if (dataset.config.status !== TimetableConfigStatus.DRAFT) {
    blockingReasons.push(
      reason('not_draft', 'Only draft timetable configs can be published', {
        timetableConfigId: dataset.config.id,
        status: dataset.config.status,
      }),
    );
  }

  if (instructionalPeriods.length === 0) {
    blockingReasons.push(
      reason(
        'no_instructional_periods',
        'Timetable config must include at least one instructional period',
        { timetableConfigId: dataset.config.id },
      ),
    );
  }

  if (schedulableEntries.length === 0) {
    blockingReasons.push(
      reason('no_entries', 'Timetable config must include timetable entries', {
        timetableConfigId: dataset.config.id,
      }),
    );
  }

  if (dataset.conflicts.length > 0) {
    blockingReasons.push(
      reason('conflicts', 'Timetable has blocking scheduling conflicts', {
        count: dataset.conflicts.length,
      }),
    );
  }

  appendAcademicContextReasons(dataset, blockingReasons);
  appendEntryReferenceReasons(dataset, blockingReasons);
  appendAuthoritativeValidationReasons(dataset, blockingReasons);

  const normalizedReasons = normalizeReasons(blockingReasons);
  return {
    canPublish:
      dataset.config.status === TimetableConfigStatus.DRAFT &&
      normalizedReasons.length === 0,
    blockingReasons: normalizedReasons,
    warnings: [],
    summary: {
      periodsCount: dataset.periods.length,
      instructionalPeriodsCount: instructionalPeriods.length,
      entriesCount: dataset.entries.length,
      conflictsCount: dataset.conflicts.length,
      activeDays: dataset.config.activeDays,
      scopeType: dataset.config.scopeType,
      academicYearId: dataset.config.academicYearId,
      termId: dataset.config.termId,
    },
  };
}

function appendAcademicContextReasons(
  dataset: TimetablePublicationDataset,
  blockingReasons: TimetablePublishBlockingReason[],
): void {
  if (!dataset.academicYear) {
    blockingReasons.push(
      reason('invalid_academic_context', 'Academic year is invalid', {
        academicYearId: dataset.config.academicYearId,
      }),
    );
  }

  if (
    !dataset.term ||
    dataset.term.academicYearId !== dataset.config.academicYearId
  ) {
    blockingReasons.push(
      reason('invalid_academic_context', 'Term is invalid', {
        termId: dataset.config.termId,
        academicYearId: dataset.config.academicYearId,
      }),
    );
    return;
  }

  if (!dataset.term.isActive) {
    blockingReasons.push(
      reason('term_closed', 'Term is closed for timetable changes', {
        termId: dataset.term.id,
      }),
    );
  }
}

function appendEntryReferenceReasons(
  dataset: TimetablePublicationDataset,
  blockingReasons: TimetablePublishBlockingReason[],
): void {
  const periodsById = new Map(
    dataset.periods.map((period) => [period.id, period]),
  );
  const classroomsById = new Map(
    dataset.allClassrooms.map((classroom) => [classroom.id, classroom]),
  );
  const allocationsById = new Map(
    dataset.teacherAllocations.map((allocation) => [allocation.id, allocation]),
  );
  const curriculumByKey = new Map(
    dataset.subjectAllocations.map((allocation) => [
      curriculumKey(allocation.gradeId, allocation.subjectId),
      allocation,
    ]),
  );
  const roomsById = new Map(dataset.rooms.map((room) => [room.id, room]));

  for (const entry of dataset.entries.filter(isSchedulableEntry)) {
    const period = periodsById.get(entry.periodId);
    if (!period || period.timetableConfigId !== dataset.config.id) {
      blockingReasons.push(
        reason(
          'invalid_period_reference',
          'Timetable entry references an invalid period',
          { entryId: entry.id, periodId: entry.periodId },
        ),
      );
    }

    if (!dataset.config.activeDays.includes(entry.dayOfWeek)) {
      blockingReasons.push(
        reason('invalid_day', 'Timetable entry day is outside active days', {
          entryId: entry.id,
          dayOfWeek: entry.dayOfWeek,
          activeDays: dataset.config.activeDays,
        }),
      );
    }

    const classroom = classroomsById.get(entry.classroomId);
    if (!classroom) {
      blockingReasons.push(
        reason(
          'invalid_classroom_reference',
          'Timetable entry references an invalid classroom',
          { entryId: entry.id, classroomId: entry.classroomId },
        ),
      );
    } else if (
      !classroomMatchesTimetableConfigScope(dataset.config, classroom)
    ) {
      blockingReasons.push(
        reason(
          'classroom_scope_mismatch',
          'Timetable entry classroom is outside config scope',
          { entryId: entry.id, classroomId: entry.classroomId },
        ),
      );
    }

    const allocation = allocationsById.get(entry.teacherSubjectAllocationId);
    if (!allocation) {
      blockingReasons.push(
        reason(
          'invalid_allocation_reference',
          'Timetable entry references an invalid teacher allocation',
          {
            entryId: entry.id,
            teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
          },
        ),
      );
    } else if (
      allocation.termId !== dataset.config.termId ||
      allocation.classroomId !== entry.classroomId ||
      allocation.subjectId !== entry.subjectId ||
      allocation.teacherUserId !== entry.teacherUserId
    ) {
      blockingReasons.push(
        reason(
          'allocation_mismatch',
          'Timetable entry allocation does not match term, classroom, subject, or teacher',
          {
            entryId: entry.id,
            teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
          },
        ),
      );
    }

    const curriculum = curriculumByKey.get(
      curriculumKey(entry.gradeId, entry.subjectId),
    );
    if (!isActiveCurriculumRequirement(curriculum)) {
      blockingReasons.push(
        reason(
          curriculum ? 'subject_not_taught' : 'missing_subject_allocation',
          'Timetable entry is not backed by an active curriculum requirement',
          { entryId: entry.id },
        ),
      );
    }

    if (entry.roomId && !roomsById.has(entry.roomId)) {
      blockingReasons.push(
        reason(
          'invalid_room_reference',
          'Timetable entry references an invalid room',
          { entryId: entry.id, roomId: entry.roomId },
        ),
      );
    }
  }
}

function appendAuthoritativeValidationReasons(
  dataset: TimetablePublicationDataset,
  blockingReasons: TimetablePublishBlockingReason[],
): void {
  for (const item of dataset.validation.response.items) {
    for (const issue of item.issues) {
      blockingReasons.push(
        reason(issue.code, issue.message, {
          classroomId: item.classroomId,
          subjectId: item.subjectId,
          ...issue.details,
        }),
      );
    }
  }
}

function normalizeReasons(
  reasons: TimetablePublishBlockingReason[],
): TimetablePublishBlockingReason[] {
  const uniqueReasons = new Map<string, TimetablePublishBlockingReason>();
  for (const item of reasons) {
    const key = [
      item.code,
      item.message,
      JSON.stringify(item.details ?? {}),
    ].join(':');
    uniqueReasons.set(key, item);
  }
  return Array.from(uniqueReasons.values()).sort((left, right) =>
    reasonSortKey(left).localeCompare(reasonSortKey(right)),
  );
}

function reasonSortKey(item: TimetablePublishBlockingReason): string {
  return [item.code, item.message, JSON.stringify(item.details ?? {})].join(
    ':',
  );
}

function curriculumKey(gradeId: string, subjectId: string): string {
  return gradeId + ':' + subjectId;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isSchedulableEntry(entry: TimetableEntryRecord): boolean {
  return entry.status !== TimetableEntryStatus.CANCELLED;
}

function reason(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): TimetablePublishBlockingReason {
  return details ? { code, message, details } : { code, message };
}
