import { Injectable } from '@nestjs/common';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { GetTimetableConfigQueryDto } from '../dto/timetable.dto';
import { TimetableConfigEnvelopeDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableConfig } from '../presenters/timetable.presenter';
import { resolveTimetableScope } from './timetable-use-case.helpers';

@Injectable()
export class GetTimetableConfigUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: GetTimetableConfigQueryDto,
  ): Promise<TimetableConfigEnvelopeDto> {
    const scope = await resolveTimetableScope(this.timetableRepository, query);
    const config = await this.timetableRepository.findConfigByScope(scope);
    if (!config) {
      throw new TimetableConfigNotFoundException({
        termId: scope.termId,
        scopeType: scope.scopeType,
        scopeKey: scope.scopeKey,
      });
    }

    return { data: presentTimetableConfig(config) };
  }
}
