import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
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
    if (existing.status !== TimetableEntryStatus.DRAFT) {
      throw new TimetableEntryNotMutableException({
        entryId,
        status: existing.status,
      });
    }

    const existingConfig = await this.timetableRepository.findConfigById(
      existing.timetableConfigId,
    );
    if (!existingConfig) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: existing.timetableConfigId,
      });
    }

    const resolved = await resolveTimetableEntryWrite(
      this.timetableRepository,
      {
        timetableConfigId: existingConfig.id,
        periodId: command.periodId ?? existing.periodId,
        dayOfWeek: command.dayOfWeek ?? existing.dayOfWeek,
        classroomId: command.classroomId ?? existing.classroomId,
        teacherSubjectAllocationId:
          command.teacherSubjectAllocationId ??
          existing.teacherSubjectAllocationId,
        subjectId: command.subjectId,
        roomId: hasOwn(command, 'roomId') ? command.roomId : existing.roomId,
        notes: hasOwn(command, 'notes') ? command.notes : existing.notes,
      },
      { excludeEntryId: existing.id },
    );

    const updated = await this.timetableRepository.updateEntry(existing.id, {
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
  }
}

function hasOwn<T extends object, K extends PropertyKey>(
  object: T,
  key: K,
): object is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key);
}
