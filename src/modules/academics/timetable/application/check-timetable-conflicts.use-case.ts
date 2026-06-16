import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { CheckTimetableConflictsDto } from '../dto/timetable.dto';
import { TimetableConflictCheckResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import {
  assertNoDuplicateTimetableSlots,
  assertValidTimetableBulkSize,
  buildTimetableConflictCheckItems,
  resolveReadableTimetableContext,
  resolveTimetableBulkItems,
} from './timetable-dashboard.helpers';

@Injectable()
export class CheckTimetableConflictsUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: CheckTimetableConflictsDto,
  ): Promise<TimetableConflictCheckResponseDto> {
    requireAcademicsScope();
    assertValidTimetableBulkSize(command.items);

    const { term } = await resolveReadableTimetableContext(
      this.timetableRepository,
      { termId: command.termId },
    );
    const duplicateSlotIssues = collectDuplicateSlotIssues(command.items);
    const { resolvedItems, issues } = await resolveTimetableBulkItems(
      this.timetableRepository,
      term,
      command.items,
      { collectIssues: true },
    );
    const existingEntries = await this.timetableRepository.listEntriesByTerm({
      termId: term.id,
    });
    const conflicts = buildTimetableConflictCheckItems({
      existingEntries,
      proposedItems: resolvedItems,
      issues: [...duplicateSlotIssues, ...issues],
    });

    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }
}

function collectDuplicateSlotIssues(
  items: CheckTimetableConflictsDto['items'],
): TimetableConflictCheckResponseDto['conflicts'] {
  try {
    assertNoDuplicateTimetableSlots(items);
    return [];
  } catch {
    const seen = new Map<string, number>();
    const conflicts: TimetableConflictCheckResponseDto['conflicts'] = [];

    for (const [index, item] of items.entries()) {
      const key = `${item.classroomId}:${item.dayOfWeek}:${item.periodId}`;
      const firstIndex = seen.get(key);
      if (firstIndex !== undefined) {
        conflicts.push({
          code: 'duplicate_slot',
          message:
            'Proposed timetable payload contains duplicate classroom slots.',
          severity: 'blocking',
          dayOfWeek: item.dayOfWeek,
          periodId: item.periodId,
          classroomId: item.classroomId,
          teacherUserId: null,
          roomId: item.roomId ?? null,
          entryIds: [],
          proposedIndexes: [firstIndex, index],
        });
        continue;
      }
      seen.set(key, index);
    }

    return conflicts;
  }
}
