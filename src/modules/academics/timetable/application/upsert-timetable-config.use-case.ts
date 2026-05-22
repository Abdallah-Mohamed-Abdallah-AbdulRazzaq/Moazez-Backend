import { Injectable } from '@nestjs/common';
import { TimetableConfigStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertConfigMutable,
  assertWeekStartDayIsValid,
  normalizeActiveDays,
} from '../domain/timetable-policy';
import { UpsertTimetableConfigDto } from '../dto/timetable.dto';
import { TimetableConfigEnvelopeDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableConfig } from '../presenters/timetable.presenter';
import { resolveTimetableScope } from './timetable-use-case.helpers';

@Injectable()
export class UpsertTimetableConfigUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: UpsertTimetableConfigDto,
  ): Promise<TimetableConfigEnvelopeDto> {
    if (
      command.status !== undefined &&
      command.status !== TimetableConfigStatus.DRAFT
    ) {
      throw new ValidationDomainException(
        'Timetable config status can only be draft through upsert',
        {
          field: 'status',
          status: command.status,
          allowedStatus: TimetableConfigStatus.DRAFT,
        },
      );
    }

    const scope = await resolveTimetableScope(this.timetableRepository, command, {
      requireWritableTerm: true,
    });
    const existing = await this.timetableRepository.findConfigByScope(scope);
    if (existing) {
      assertConfigMutable(existing);
    }

    const weekStartDay = command.weekStartDay ?? existing?.weekStartDay ?? 0;
    assertWeekStartDayIsValid(weekStartDay);

    const activeDays =
      command.activeDays !== undefined
        ? normalizeActiveDays(command.activeDays)
        : existing?.activeDays ?? normalizeActiveDays();

    const name = command.name.trim();
    if (name.length === 0) {
      throw new ValidationDomainException('Timetable config name is required', {
        field: 'name',
      });
    }

    const data = {
      name,
      weekStartDay,
      activeDays,
      academicYearId: scope.academicYearId,
      termId: scope.termId,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      gradeId: scope.gradeId,
      sectionId: scope.sectionId,
      classroomId: scope.classroomId,
      status: TimetableConfigStatus.DRAFT,
    };

    const config = existing
      ? await this.timetableRepository.updateConfig(existing.id, data)
      : await this.timetableRepository.createConfig({
          schoolId: scope.schoolId,
          ...data,
        });

    return { data: presentTimetableConfig(config) };
  }
}
