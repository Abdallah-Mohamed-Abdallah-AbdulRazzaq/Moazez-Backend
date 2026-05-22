import { Injectable } from '@nestjs/common';
import {
  assertConfigMutable,
  assertTermWritable,
} from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetablePeriodInUseException,
  TimetablePeriodNotFoundException,
} from '../domain/timetable.exceptions';
import { DeleteTimetablePeriodResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';

@Injectable()
export class DeleteTimetablePeriodUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(periodId: string): Promise<DeleteTimetablePeriodResponseDto> {
    const period = await this.timetableRepository.findPeriodById(periodId);
    if (!period) {
      throw new TimetablePeriodNotFoundException({ periodId });
    }

    const config = await this.timetableRepository.findConfigById(
      period.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: period.timetableConfigId,
      });
    }
    assertConfigMutable(config);

    const term = await this.timetableRepository.findTermById(config.termId);
    if (term) assertTermWritable(term);

    const result = await this.timetableRepository.deletePeriod(period.id);
    if (result.status === 'not_found') {
      throw new TimetablePeriodNotFoundException({ periodId });
    }
    if (result.status === 'in_use') {
      throw new TimetablePeriodInUseException({
        periodId,
        entryCount: result.entryCount,
      });
    }

    return { ok: true };
  }
}
