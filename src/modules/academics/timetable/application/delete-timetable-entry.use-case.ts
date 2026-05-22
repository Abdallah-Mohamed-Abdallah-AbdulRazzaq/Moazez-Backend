import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import {
  assertConfigMutable,
  assertTermWritable,
} from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetableEntryNotMutableException,
  TimetableEntryNotFoundException,
} from '../domain/timetable.exceptions';
import { DeleteTimetableEntryResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';

@Injectable()
export class DeleteTimetableEntryUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(entryId: string): Promise<DeleteTimetableEntryResponseDto> {
    const entry = await this.timetableRepository.findEntryById(entryId);
    if (!entry) {
      throw new TimetableEntryNotFoundException({ entryId });
    }
    if (entry.status !== TimetableEntryStatus.DRAFT) {
      throw new TimetableEntryNotMutableException({
        entryId,
        status: entry.status,
      });
    }

    const config = await this.timetableRepository.findConfigById(
      entry.timetableConfigId,
    );
    if (!config) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: entry.timetableConfigId,
      });
    }
    assertConfigMutable(config);

    const term = await this.timetableRepository.findTermById(config.termId);
    if (term) assertTermWritable(term);

    const result = await this.timetableRepository.deleteEntry(entry.id);
    if (result.status === 'not_found') {
      throw new TimetableEntryNotFoundException({ entryId });
    }

    return { ok: true };
  }
}
