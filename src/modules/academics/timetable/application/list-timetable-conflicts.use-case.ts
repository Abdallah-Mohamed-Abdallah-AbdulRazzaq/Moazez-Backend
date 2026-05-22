import { Injectable } from '@nestjs/common';
import { computeTimetableConflicts } from '../domain/timetable-conflicts';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
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

    const [entries, persistedConflicts] = await Promise.all([
      this.timetableRepository.listEntriesForConfig(config.id),
      this.timetableRepository.listPersistedConflicts(config.id),
    ]);
    return presentTimetableConflicts([
      ...persistedConflicts,
      ...computeTimetableConflicts(entries),
    ]);
  }
}
