import { Injectable } from '@nestjs/common';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { computeTimetableConflicts } from '../domain/timetable-conflicts';
import { TimetableConfigIdQueryDto } from '../dto/timetable.dto';
import { TimetableConflictsListResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableConflicts } from '../presenters/timetable.presenter';

@Injectable()
export class ListTimetableConflictsUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: TimetableConfigIdQueryDto,
  ): Promise<TimetableConflictsListResponseDto> {
    const config = await this.timetableRepository.findConfigById(
      query.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: query.timetableConfigId,
      });
    }

    const entries = await this.timetableRepository.listEntriesByTerm({
      termId: config.termId,
    });
    const requestedEntryIds = new Set(
      entries
        .filter((entry) => entry.timetableConfigId === config.id)
        .map((entry) => entry.id),
    );
    const conflicts = computeTimetableConflicts(entries).filter((conflict) =>
      conflict.entryIds.some((entryId) => requestedEntryIds.has(entryId)),
    );

    return presentTimetableConflicts(conflicts);
  }
}
