import { Injectable } from '@nestjs/common';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { TimetableConfigIdQueryDto } from '../dto/timetable.dto';
import { TimetableConflictsListResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableConflicts } from '../presenters/timetable.presenter';
import { loadTimetablePublicationDataset } from './timetable-publication-readiness';

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

    const dataset = await loadTimetablePublicationDataset(
      this.timetableRepository,
      config,
    );

    return presentTimetableConflicts(dataset.conflicts);
  }
}
