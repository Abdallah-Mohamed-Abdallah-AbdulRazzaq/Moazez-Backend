import { Injectable } from '@nestjs/common';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { TimetableConfigIdQueryDto } from '../dto/timetable.dto';
import { TimetablePreviewResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetablePreview } from '../presenters/timetable.presenter';
import {
  buildTimetablePublishReadiness,
  loadTimetablePublicationDataset,
} from './timetable-publication-readiness';

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

    const dataset = await loadTimetablePublicationDataset(
      this.timetableRepository,
      config,
    );
    const publishReadiness = buildTimetablePublishReadiness(dataset);

    return presentTimetablePreview({
      config,
      periods: dataset.periods,
      entries: dataset.entries,
      conflicts: dataset.conflicts,
      publishReadiness,
    });
  }
}
