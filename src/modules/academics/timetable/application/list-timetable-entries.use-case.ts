import { Injectable } from '@nestjs/common';
import { TimetableConfigNotFoundException } from '../domain/timetable.exceptions';
import { ListTimetableEntriesQueryDto } from '../dto/timetable.dto';
import { TimetableEntriesListResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableEntries } from '../presenters/timetable.presenter';

@Injectable()
export class ListTimetableEntriesUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: ListTimetableEntriesQueryDto,
  ): Promise<TimetableEntriesListResponseDto> {
    const config = await this.timetableRepository.findConfigById(
      query.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: query.timetableConfigId,
      });
    }

    const entries = await this.timetableRepository.listEntries({
      timetableConfigId: config.id,
      classroomId: query.classroomId,
      teacherUserId: query.teacherUserId,
      subjectId: query.subjectId,
      roomId: query.roomId,
      dayOfWeek: query.dayOfWeek,
      status: query.status,
    });

    return presentTimetableEntries(entries);
  }
}
