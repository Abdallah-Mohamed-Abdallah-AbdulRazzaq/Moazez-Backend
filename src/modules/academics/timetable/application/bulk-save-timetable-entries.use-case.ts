import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
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

    const transaction = await this.timetableRepository.withSerializedTermWrite(
      { termId: command.termId },
      async (repository) => {
        const { term } = await resolveReadableTimetableContext(repository, {
          termId: command.termId,
        });
        const { resolvedItems } = await resolveTimetableBulkItems(
          repository,
          term,
          command.items,
        );
        const existingEntries = await repository.listEntriesByTerm({
          termId: term.id,
        });
        const conflicts = buildTimetableConflictCheckItems({
          existingEntries,
          proposedItems: resolvedItems,
        });
        throwIfBlockingTimetableConflicts(conflicts);

        return repository.bulkUpsertEntries(resolvedItems);
      },
    );
    if (transaction.status === 'not_found') {
      throw new NotFoundDomainException('Term not found', {
        termId: command.termId,
      });
    }
    const result = transaction.value;

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
