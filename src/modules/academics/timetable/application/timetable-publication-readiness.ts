import {
  TimetableConfigStatus,
  TimetableConflictSeverity,
  TimetableConflictStatus,
  TimetableEntryStatus,
  TimetableScopeType,
} from '@prisma/client';
import {
  ComputedTimetableConflict,
  computeTimetableConflicts,
} from '../domain/timetable-conflicts';
import { classroomMatchesTimetableConfigScope } from '../domain/timetable-policy';
import {
  TimetableConfigRecord,
  TimetableEntryRecord,
  TimetablePeriodRecord,
  TimetableRepository,
} from '../infrastructure/timetable.repository';

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
  periods: TimetablePeriodRecord[];
  entries: TimetableEntryRecord[];
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
  const [periods, entries] = await Promise.all([
    repository.listPeriods(config.id),
    repository.listEntriesForConfig(config.id),
  ]);

  return {
    config,
    periods,
    entries,
    conflicts: computeTimetableConflicts(entries),
  };
}

export async function buildTimetablePublishReadiness(
  repository: TimetableRepository,
  dataset: TimetablePublicationDataset,
): Promise<TimetablePublishReadiness> {
  const blockingReasons: TimetablePublishBlockingReason[] = [];
  const instructionalPeriods = dataset.periods.filter(
    (period) => period.isInstructional,
  );
  const schedulableEntries = dataset.entries.filter(
    (entry) => entry.status !== TimetableEntryStatus.CANCELLED,
  );
  const blockingConflicts = dataset.conflicts.filter(
    (conflict) =>
      conflict.severity === TimetableConflictSeverity.BLOCKING &&
      conflict.status === TimetableConflictStatus.OPEN,
  );

  if (dataset.config.status !== TimetableConfigStatus.DRAFT) {
    blockingReasons.push(
      reason(
        'not_draft',
        'Only draft timetable configs can be published',
        {
          timetableConfigId: dataset.config.id,
          status: dataset.config.status,
        },
      ),
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

  if (blockingConflicts.length > 0) {
    blockingReasons.push(
      reason('conflicts', 'Timetable has blocking scheduling conflicts', {
        count: blockingConflicts.length,
      }),
    );
  }

  await appendAcademicContextReasons(repository, dataset, blockingReasons);
  await appendEntryReferenceReasons(repository, dataset, blockingReasons);

  return {
    canPublish:
      dataset.config.status === TimetableConfigStatus.DRAFT &&
      blockingReasons.length === 0,
    blockingReasons,
    warnings: [],
    summary: {
      periodsCount: dataset.periods.length,
      instructionalPeriodsCount: instructionalPeriods.length,
      entriesCount: dataset.entries.length,
      conflictsCount: blockingConflicts.length,
      activeDays: dataset.config.activeDays,
      scopeType: dataset.config.scopeType,
      academicYearId: dataset.config.academicYearId,
      termId: dataset.config.termId,
    },
  };
}

async function appendAcademicContextReasons(
  repository: TimetableRepository,
  dataset: TimetablePublicationDataset,
  blockingReasons: TimetablePublishBlockingReason[],
): Promise<void> {
  const [academicYear, term] = await Promise.all([
    repository.findAcademicYearById(dataset.config.academicYearId),
    repository.findTermById(dataset.config.termId),
  ]);

  if (!academicYear) {
    blockingReasons.push(
      reason('invalid_academic_context', 'Academic year is invalid', {
        academicYearId: dataset.config.academicYearId,
      }),
    );
  }

  if (!term || term.academicYearId !== dataset.config.academicYearId) {
    blockingReasons.push(
      reason('invalid_academic_context', 'Term is invalid', {
        termId: dataset.config.termId,
        academicYearId: dataset.config.academicYearId,
      }),
    );
    return;
  }

  if (!term.isActive) {
    blockingReasons.push(
      reason('term_closed', 'Term is closed for timetable changes', {
        termId: term.id,
      }),
    );
  }
}

async function appendEntryReferenceReasons(
  repository: TimetableRepository,
  dataset: TimetablePublicationDataset,
  blockingReasons: TimetablePublishBlockingReason[],
): Promise<void> {
  const periodsById = new Map(
    dataset.periods.map((period) => [period.id, period]),
  );
  const schedulableEntries = dataset.entries.filter(
    (entry) => entry.status !== TimetableEntryStatus.CANCELLED,
  );

  for (const entry of schedulableEntries) {
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

    const classroom = await repository.findClassroomById(entry.classroomId);
    if (!classroom) {
      blockingReasons.push(
        reason(
          'invalid_classroom_reference',
          'Timetable entry references an invalid classroom',
          { entryId: entry.id, classroomId: entry.classroomId },
        ),
      );
    } else if (!classroomMatchesTimetableConfigScope(dataset.config, classroom)) {
      blockingReasons.push(
        reason(
          'classroom_scope_mismatch',
          'Timetable entry classroom is outside config scope',
          { entryId: entry.id, classroomId: entry.classroomId },
        ),
      );
    }

    const allocation = await repository.findTeacherAllocationById(
      entry.teacherSubjectAllocationId,
    );
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

    if (entry.roomId) {
      const room = await repository.findRoomById(entry.roomId);
      if (!room) {
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
}

function reason(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): TimetablePublishBlockingReason {
  return details ? { code, message, details } : { code, message };
}
