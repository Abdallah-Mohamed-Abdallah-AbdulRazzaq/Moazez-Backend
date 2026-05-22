import { Injectable } from '@nestjs/common';
import { computeTimetableConflicts } from '../domain/timetable-conflicts';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { TimetableConfigIdQueryDto } from '../dto/timetable.dto';
import { TimetablePreviewResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetablePreview } from '../presenters/timetable.presenter';

@Injectable()
export class GetTimetablePreviewUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: TimetableConfigIdQueryDto,
  ): Promise<TimetablePreviewResponseDto> {
    const config = await this.timetableRepository.findConfigById(
      query.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: query.timetableConfigId,
      });
    }

    const [periods, entries, persistedConflicts] = await Promise.all([
      this.timetableRepository.listPeriods(config.id),
      this.timetableRepository.listEntriesForConfig(config.id),
      this.timetableRepository.listPersistedConflicts(config.id),
    ]);
    const computedConflicts = computeTimetableConflicts(entries);

    return presentTimetablePreview({
      config,
      periods,
      entries,
      conflicts: [...persistedConflicts, ...computedConflicts],
    });
  }
}
