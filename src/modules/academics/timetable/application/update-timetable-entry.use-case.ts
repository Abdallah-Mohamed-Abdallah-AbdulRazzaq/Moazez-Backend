import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import { assertConfigMutable } from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetableEntryNotMutableException,
  TimetableEntryNotFoundException,
} from '../domain/timetable.exceptions';
import { UpdateTimetableEntryDto } from '../dto/timetable.dto';
import { TimetableEntryResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableEntry } from '../presenters/timetable.presenter';
import { resolveTimetableEntryWrite } from './timetable-entry-write.helpers';

@Injectable()
export class UpdateTimetableEntryUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    entryId: string,
    command: UpdateTimetableEntryDto,
  ): Promise<TimetableEntryResponseDto> {
    const existing = await this.timetableRepository.findEntryById(entryId);
    if (!existing) {
      throw new TimetableEntryNotFoundException({ entryId });
    }

    const existingConfig = await this.timetableRepository.findConfigById(
      existing.timetableConfigId,
    );
    if (!existingConfig) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: existing.timetableConfigId,
      });
    }
    assertConfigMutable(existingConfig);

    if (existing.status !== TimetableEntryStatus.DRAFT) {
      throw new TimetableEntryNotMutableException({
        entryId,
        status: existing.status,
      });
    }

    const transaction = await this.timetableRepository.withSerializedTermWrite(
      {
        termId: existingConfig.termId,
        timetableConfigIds: [existingConfig.id],
      },
      async (repository) => {
        const current = await repository.findEntryById(entryId);
        if (!current) {
          throw new TimetableEntryNotFoundException({ entryId });
        }
        if (current.status !== TimetableEntryStatus.DRAFT) {
          throw new TimetableEntryNotMutableException({
            entryId,
            status: current.status,
          });
        }

        const resolved = await resolveTimetableEntryWrite(
          repository,
          {
            timetableConfigId: current.timetableConfigId,
            periodId: command.periodId ?? current.periodId,
            dayOfWeek: command.dayOfWeek ?? current.dayOfWeek,
            classroomId: command.classroomId ?? current.classroomId,
            teacherSubjectAllocationId:
              command.teacherSubjectAllocationId ??
              current.teacherSubjectAllocationId,
            subjectId: command.subjectId,
            roomId: hasOwn(command, 'roomId') ? command.roomId : current.roomId,
            notes: hasOwn(command, 'notes') ? command.notes : current.notes,
          },
          { excludeEntryId: current.id },
        );

        const updated = await repository.updateEntry(current.id, {
          academicYearId: resolved.academicYearId,
          termId: resolved.termId,
          timetableConfigId: resolved.config.id,
          periodId: resolved.periodId,
          dayOfWeek: resolved.dayOfWeek,
          gradeId: resolved.gradeId,
          sectionId: resolved.sectionId,
          classroomId: resolved.classroomId,
          subjectId: resolved.subjectId,
          teacherUserId: resolved.teacherUserId,
          teacherSubjectAllocationId: resolved.teacherSubjectAllocationId,
          roomId: resolved.roomId,
          notes: resolved.notes,
        });

        return presentTimetableEntry(updated);
      },
    );
    if (transaction.status === 'not_found') {
      throw new TimetableEntryNotFoundException({ entryId });
    }

    return transaction.value;
  }
}

function hasOwn<T extends object, K extends PropertyKey>(
  object: T,
  key: K,
): object is T & Record<K, unknown> {
  return Boolean(Object.prototype.hasOwnProperty.call(object, key));
}
