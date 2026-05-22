import { Injectable } from '@nestjs/common';
import { TimetableEntryNotFoundException } from '../domain/timetable.exceptions';
import { TimetableEntryResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import { presentTimetableEntry } from '../presenters/timetable.presenter';

@Injectable()
export class GetTimetableEntryUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(entryId: string): Promise<TimetableEntryResponseDto> {
    const entry = await this.timetableRepository.findEntryById(entryId);
    if (!entry) {
      throw new TimetableEntryNotFoundException({ entryId });
    }

    return presentTimetableEntry(entry);
  }
}
