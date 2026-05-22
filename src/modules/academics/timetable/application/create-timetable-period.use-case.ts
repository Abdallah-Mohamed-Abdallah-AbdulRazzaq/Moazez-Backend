import { Injectable } from '@nestjs/common';
import { TimetablePeriodType } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertConfigMutable,
  assertTermWritable,
} from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetablePeriodIndexTakenException,
} from '../domain/timetable.exceptions';
import {
  assertNoPeriodOverlap,
  validateTimetableTimeRange,
} from '../domain/timetable-time';
import { CreateTimetablePeriodDto } from '../dto/timetable.dto';
import { TimetablePeriodResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetablePeriod } from '../presenters/timetable.presenter';

@Injectable()
export class CreateTimetablePeriodUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: CreateTimetablePeriodDto,
  ): Promise<TimetablePeriodResponseDto> {
    const config = await this.timetableRepository.findConfigById(
      command.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: command.timetableConfigId,
      });
    }
    assertConfigMutable(config);

    const term = await this.timetableRepository.findTermById(config.termId);
    if (term) assertTermWritable(term);

    const existingWithIndex = await this.timetableRepository.findPeriodByIndex({
      timetableConfigId: config.id,
      periodIndex: command.index,
    });
    if (existingWithIndex) {
      throw new TimetablePeriodIndexTakenException({
        timetableConfigId: config.id,
        periodIndex: command.index,
      });
    }

    const timeRange = validateTimetableTimeRange(command);
    const periods = await this.timetableRepository.listPeriods(config.id);
    assertNoPeriodOverlap(timeRange, periods);

    const periodType = command.type ?? TimetablePeriodType.CLASS;
    const isInstructional =
      command.isInstructional ?? periodType === TimetablePeriodType.CLASS;

    const label = command.label.trim();
    if (label.length === 0) {
      throw new ValidationDomainException('Timetable period label is required', {
        field: 'label',
      });
    }

    const period = await this.timetableRepository.createPeriod({
      schoolId: config.schoolId,
      timetableConfigId: config.id,
      periodIndex: command.index,
      label,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      type: periodType,
      isInstructional,
    });

    return presentTimetablePeriod(period);
  }
}
