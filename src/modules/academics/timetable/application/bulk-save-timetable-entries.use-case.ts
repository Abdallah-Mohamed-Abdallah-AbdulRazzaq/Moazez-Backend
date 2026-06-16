import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { BulkSaveTimetableEntriesDto } from '../dto/timetable.dto';
import { TimetableEntriesBulkResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableEntry } from '../presenters/timetable.presenter';
import {
  assertNoDuplicateTimetableSlots,
  assertValidTimetableBulkSize,
  buildTimetableConflictCheckItems,
  resolveTimetableBulkItems,
  resolveReadableTimetableContext,
  throwIfBlockingTimetableConflicts,
} from './timetable-dashboard.helpers';

@Injectable()
export class BulkSaveTimetableEntriesUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: BulkSaveTimetableEntriesDto,
  ): Promise<TimetableEntriesBulkResponseDto> {
    requireAcademicsScope();
    assertValidTimetableBulkSize(command.items);
    assertNoDuplicateTimetableSlots(command.items);

    const { term } = await resolveReadableTimetableContext(
      this.timetableRepository,
      { termId: command.termId },
    );
    const { resolvedItems } = await resolveTimetableBulkItems(
      this.timetableRepository,
      term,
      command.items,
    );
    const existingEntries = await this.timetableRepository.listEntriesByTerm({
      termId: term.id,
    });
    const conflicts = buildTimetableConflictCheckItems({
      existingEntries,
      proposedItems: resolvedItems,
    });
    throwIfBlockingTimetableConflicts(conflicts);

    const result = await this.timetableRepository.bulkUpsertEntries(
      resolvedItems,
    );

    return {
      items: result.entries.map((entry) => presentTimetableEntry(entry)),
      summary: {
        requestedCount: command.items.length,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
      },
    };
  }
}
