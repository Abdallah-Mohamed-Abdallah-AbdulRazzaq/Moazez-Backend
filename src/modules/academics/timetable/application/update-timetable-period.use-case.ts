import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertConfigMutable,
  assertTermWritable,
} from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetablePeriodIndexTakenException,
  TimetablePeriodNotFoundException,
} from '../domain/timetable.exceptions';
import {
  assertNoPeriodOverlap,
  validateTimetableTimeRange,
} from '../domain/timetable-time';
import { UpdateTimetablePeriodDto } from '../dto/timetable.dto';
import { TimetablePeriodResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetablePeriod } from '../presenters/timetable.presenter';

@Injectable()
export class UpdateTimetablePeriodUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    periodId: string,
    command: UpdateTimetablePeriodDto,
  ): Promise<TimetablePeriodResponseDto> {
    const existing = await this.timetableRepository.findPeriodById(periodId);
    if (!existing) {
      throw new TimetablePeriodNotFoundException({ periodId });
    }

    const config = await this.timetableRepository.findConfigById(
      existing.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: existing.timetableConfigId,
      });
    }
    assertConfigMutable(config);

    const term = await this.timetableRepository.findTermById(config.termId);
    if (term) assertTermWritable(term);

    const nextIndex = command.index ?? existing.periodIndex;
    if (nextIndex !== existing.periodIndex) {
      const existingWithIndex =
        await this.timetableRepository.findPeriodByIndex({
          timetableConfigId: config.id,
          periodIndex: nextIndex,
        });
      if (existingWithIndex) {
        throw new TimetablePeriodIndexTakenException({
          timetableConfigId: config.id,
          periodIndex: nextIndex,
        });
      }
    }

    const timeRange = validateTimetableTimeRange({
      startTime: command.startTime ?? existing.startTime,
      endTime: command.endTime ?? existing.endTime,
    });
    const periods = await this.timetableRepository.listPeriods(config.id);
    assertNoPeriodOverlap({ ...timeRange, periodId: existing.id }, periods);

    const label = command.label?.trim() ?? existing.label;
    if (label.length === 0) {
      throw new ValidationDomainException('Timetable period label is required', {
        field: 'label',
      });
    }

    const updated = await this.timetableRepository.updatePeriod(existing.id, {
      periodIndex: nextIndex,
      label,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      type: command.type ?? existing.type,
      isInstructional: command.isInstructional ?? existing.isInstructional,
    });

    return presentTimetablePeriod(updated);
  }
}
