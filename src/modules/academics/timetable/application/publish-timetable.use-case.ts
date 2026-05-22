import { Injectable } from '@nestjs/common';
import { TimetableConfigStatus, TimetableEntryStatus } from '@prisma/client';
import { requireAcademicsScope } from '../../academics-context';
import { assertTermWritable } from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetableNoEntriesException,
  TimetableNoPeriodsException,
  TimetableNotDraftException,
  TimetablePublishBlockedException,
} from '../domain/timetable.exceptions';
import { PublishTimetableDto } from '../dto/timetable.dto';
import { TimetablePublicationResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetablePublication } from '../presenters/timetable.presenter';
import {
  buildTimetablePublishReadiness,
  loadTimetablePublicationDataset,
} from './timetable-publication-readiness';

@Injectable()
export class PublishTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: PublishTimetableDto,
  ): Promise<TimetablePublicationResponseDto> {
    const scope = requireAcademicsScope();
    const config = await this.timetableRepository.findConfigById(
      command.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: command.timetableConfigId,
      });
    }

    if (config.status !== TimetableConfigStatus.DRAFT) {
      throw new TimetableNotDraftException({
        timetableConfigId: config.id,
        status: config.status,
      });
    }

    const term = await this.timetableRepository.findTermById(config.termId);
    if (term) assertTermWritable(term);

    const dataset = await loadTimetablePublicationDataset(
      this.timetableRepository,
      config,
    );
    const readiness = await buildTimetablePublishReadiness(
      this.timetableRepository,
      dataset,
    );
    if (!readiness.canPublish) {
      throwReadinessException(config.id, readiness.blockingReasons);
    }

    const latestPublication =
      await this.timetableRepository.findLatestPublicationByConfigId(config.id);
    const result = await this.timetableRepository.publishConfig({
      config,
      revision: (latestPublication?.revision ?? 0) + 1,
      publishedAt: new Date(),
      publishedByUserId: scope.actorId,
    });
    const refreshedReadiness = await buildTimetablePublishReadiness(
      this.timetableRepository,
      {
        ...dataset,
        config: result.config,
        entries: dataset.entries.map((entry) =>
          entry.status === TimetableEntryStatus.DRAFT
            ? { ...entry, status: TimetableEntryStatus.ACTIVE }
            : entry,
        ),
      },
    );

    return presentTimetablePublication({
      config: result.config,
      publication: result.publication,
      readiness: refreshedReadiness,
    });
  }
}

function throwReadinessException(
  timetableConfigId: string,
  blockingReasons: Array<{ code: string; message: string }>,
): never {
  if (
    blockingReasons.some((reason) => reason.code === 'no_instructional_periods')
  ) {
    throw new TimetableNoPeriodsException({ timetableConfigId });
  }

  if (blockingReasons.some((reason) => reason.code === 'no_entries')) {
    throw new TimetableNoEntriesException({ timetableConfigId });
  }

  throw new TimetablePublishBlockedException({
    timetableConfigId,
    blockingReasons,
  });
}
