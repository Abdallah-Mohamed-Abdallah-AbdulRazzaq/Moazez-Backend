import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import { CreateTimetableEntryDto } from '../dto/timetable.dto';
import { TimetableEntryResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableEntry } from '../presenters/timetable.presenter';
import { resolveTimetableEntryWrite } from './timetable-entry-write.helpers';

@Injectable()
export class CreateTimetableEntryUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: CreateTimetableEntryDto,
  ): Promise<TimetableEntryResponseDto> {
    const resolved = await resolveTimetableEntryWrite(
      this.timetableRepository,
      command,
    );

    const entry = await this.timetableRepository.createEntry({
      schoolId: resolved.schoolId,
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
      status: TimetableEntryStatus.DRAFT,
    });

    return presentTimetableEntry(entry);
  }
}
