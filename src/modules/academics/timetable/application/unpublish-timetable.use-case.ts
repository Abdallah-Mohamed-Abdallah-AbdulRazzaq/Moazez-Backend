import { Injectable } from '@nestjs/common';
import { TimetablePublicationStatus } from '@prisma/client';
import { requireAcademicsScope } from '../../academics-context';
import { assertTermWritable } from '../domain/timetable-policy';
import { UnpublishTimetableDto } from '../dto/timetable.dto';
import { TimetableUnpublishResponseDto } from '../dto/timetable-response.dto';
import {
  TimetableConfigRecord,
  TimetablePublicationRecord,
  TimetableRepository,
} from '../infrastructure/timetable.repository';
import { resolveReadableTimetableContext } from './timetable-dashboard.helpers';

@Injectable()
export class UnpublishTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: UnpublishTimetableDto,
  ): Promise<TimetableUnpublishResponseDto> {
    requireAcademicsScope();

    const { term } = await resolveReadableTimetableContext(
      this.timetableRepository,
      command,
    );
    assertTermWritable(term);

    const configs = filterConfigsForScope(
      await this.timetableRepository.listConfigsByTerm(term.id),
      command,
    );
    const latestPublications = latestPublicationsByConfig(
      await this.timetableRepository.findLatestPublicationsByConfigIds(
        configs.map((config) => config.id),
      ),
    );
    const publishedConfigIds = configs
      .filter(
        (config) =>
          latestPublications.get(config.id)?.status ===
          TimetablePublicationStatus.PUBLISHED,
      )
      .map((config) => config.id);
    const result =
      await this.timetableRepository.unpublishConfigs(publishedConfigIds);

    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      summary: {
        configsChecked: configs.length,
        unpublishedCount: result.unpublishedCount,
        entriesReturnedToDraft: result.entriesReturnedToDraft,
      },
    };
  }
}

function filterConfigsForScope(
  configs: TimetableConfigRecord[],
  command: UnpublishTimetableDto,
): TimetableConfigRecord[] {
  return configs.filter((config) => {
    if (command.classroomId) {
      return config.classroomId === command.classroomId;
    }
    if (command.gradeId) {
      return config.gradeId === command.gradeId;
    }
    return true;
  });
}

function latestPublicationsByConfig(
  publications: TimetablePublicationRecord[],
): Map<string, TimetablePublicationRecord> {
  const result = new Map<string, TimetablePublicationRecord>();
  for (const publication of publications) {
    const current = result.get(publication.timetableConfigId);
    if (!current || publication.revision > current.revision) {
      result.set(publication.timetableConfigId, publication);
    }
  }
  return result;
}
