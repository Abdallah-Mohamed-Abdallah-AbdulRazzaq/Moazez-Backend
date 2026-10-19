import { Injectable } from '@nestjs/common';
import { TimetablePublicationStatus } from '@prisma/client';
import { isUUID } from 'class-validator';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { assertTermWritable } from '../domain/timetable-policy';
import { UnpublishTimetableDto } from '../dto/timetable.dto';
import { TimetableUnpublishResponseDto } from '../dto/timetable-response.dto';
import {
  TimetableConfigRecord,
  TimetablePublicationRecord,
  TimetableRepository,
} from '../infrastructure/timetable.repository';
import {
  assertTimetableConfigPublicationIdentity,
  resolveReadableTimetableContext,
} from './timetable-dashboard.helpers';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';

@Injectable()
export class UnpublishTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: UnpublishTimetableDto,
  ): Promise<TimetableUnpublishResponseDto> {
    const scope = requireAcademicsScope();
    const exact = command.timetableConfigId !== undefined;
    if (
      exact &&
      (typeof command.timetableConfigId !== 'string' ||
        !isUUID(command.timetableConfigId) ||
        command.gradeId !== undefined ||
        command.classroomId !== undefined)
    ) {
      throw new ValidationDomainException(
        'An exact timetableConfigId must be a UUID and cannot be combined with gradeId or classroomId',
      );
    }
    const serialized = await this.timetableRepository.withSerializedTermWrite(
      {
        termId: command.termId,
        ...(exact
          ? { timetableConfigIds: [command.timetableConfigId!] }
          : { lockAllTermConfigs: true }),
      },
      async (repository) => {
        const { term } = await resolveReadableTimetableContext(
          repository,
          command,
        );
        let configs: TimetableConfigRecord[];
        if (exact) {
          const config = await repository.findConfigById(
            command.timetableConfigId!,
          );
          if (!config)
            throw new TimetableConfigNotFoundException({
              timetableConfigId: command.timetableConfigId,
            });
          await assertTimetableConfigPublicationIdentity(
            repository,
            config,
            term,
            scope.schoolId,
          );
          configs = [config];
        } else {
          configs = filterConfigsForScope(
            await repository.listConfigsByTerm(term.id),
            command,
          );
        }
        assertTermWritable(term);
        const latestPublications = latestPublicationsByConfig(
          await repository.findLatestPublicationsByConfigIds(
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
        const result = await repository.unpublishConfigs(publishedConfigIds);

        return {
          termId: term.id,
          academicYearId: term.academicYearId,
          summary: {
            configsChecked: configs.length,
            unpublishedCount: result.unpublishedCount,
            entriesReturnedToDraft: result.entriesReturnedToDraft,
          },
        };
      },
    );
    if (serialized.status === 'not_found') {
      if (exact)
        throw new TimetableConfigNotFoundException({
          timetableConfigId: command.timetableConfigId,
        });
      throw new NotFoundDomainException('Term not found', {
        termId: command.termId,
      });
    }
    return serialized.value;
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
