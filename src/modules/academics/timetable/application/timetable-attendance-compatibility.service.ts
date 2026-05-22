import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { TimetableEntryNotFoundException } from '../domain/timetable.exceptions';
import {
  TimetableEntryRecord,
  TimetableRepository,
} from '../infrastructure/timetable.repository';

export interface TimetableAttendanceCompatibilityKey {
  timetableEntryId: string;
  date: string;
  academicYearId: string;
  termId: string;
  classroomId: string;
  periodId: string;
  periodKey: string;
  periodLabel: string;
  periodStartTime: string;
  periodEndTime: string;
  teacherSubjectAllocationId: string;
}

@Injectable()
export class TimetableAttendanceCompatibilityService {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async deriveForEntry(
    timetableEntryId: string,
    date: string | Date,
  ): Promise<TimetableAttendanceCompatibilityKey> {
    const entry = await this.timetableRepository.findEntryById(timetableEntryId);
    if (!entry) {
      throw new TimetableEntryNotFoundException({ entryId: timetableEntryId });
    }

    return deriveTimetableAttendanceCompatibilityKey(entry, date);
  }
}

export function deriveTimetableAttendanceCompatibilityKey(
  entry: TimetableEntryRecord,
  date: string | Date,
): TimetableAttendanceCompatibilityKey {
  const attendanceDate = normalizeDate(date);

  return {
    timetableEntryId: entry.id,
    date: attendanceDate,
    academicYearId: entry.academicYearId,
    termId: entry.termId,
    classroomId: entry.classroomId,
    periodId: entry.periodId,
    periodKey: `timetable-entry:${entry.id}`,
    periodLabel: entry.period.label,
    periodStartTime: entry.period.startTime,
    periodEndTime: entry.period.endTime,
    teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
  };
}

function normalizeDate(date: string | Date): string {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationDomainException('Invalid timetable attendance date', {
      field: 'date',
    });
  }

  return parsed.toISOString().slice(0, 10);
}
