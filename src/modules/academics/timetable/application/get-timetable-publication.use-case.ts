import { Injectable } from '@nestjs/common';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { TimetableConfigIdQueryDto } from '../dto/timetable.dto';
import { TimetablePublicationResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetablePublication } from '../presenters/timetable.presenter';
import {
  buildTimetablePublishReadiness,
  loadTimetablePublicationDataset,
} from './timetable-publication-readiness';

@Injectable()
export class GetTimetablePublicationUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: TimetableConfigIdQueryDto,
  ): Promise<TimetablePublicationResponseDto> {
    const config = await this.timetableRepository.findConfigById(
      query.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: query.timetableConfigId,
      });
    }

    const [publication, dataset] = await Promise.all([
      this.timetableRepository.findLatestPublicationByConfigId(config.id),
      loadTimetablePublicationDataset(this.timetableRepository, config),
    ]);
    const readiness = await buildTimetablePublishReadiness(
      this.timetableRepository,
      dataset,
    );

    return presentTimetablePublication({
      config,
      publication,
      readiness,
    });
  }
}
