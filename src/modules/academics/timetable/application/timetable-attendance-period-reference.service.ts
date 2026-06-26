import { Injectable } from '@nestjs/common';
import { TimetableConfigStatus } from '@prisma/client';
import { TimetableRepository } from '../infrastructure/timetable.repository';

const ATTENDANCE_ALLOWED_TIMETABLE_CONFIG_STATUSES = [
  TimetableConfigStatus.DRAFT,
  TimetableConfigStatus.ACTIVE,
];

@Injectable()
export class TimetableAttendancePeriodReferenceService {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async findValidPeriodIdsForAttendanceContext(input: {
    academicYearId: string;
    termId: string;
    periodIds: string[];
  }): Promise<Set<string>> {
    const uniquePeriodIds = [...new Set(input.periodIds)];
    if (uniquePeriodIds.length === 0) {
      return new Set();
    }

    const validPeriodIds =
      await this.timetableRepository.findPeriodIdsForAttendanceContext({
        academicYearId: input.academicYearId,
        termId: input.termId,
        periodIds: uniquePeriodIds,
        allowedConfigStatuses: ATTENDANCE_ALLOWED_TIMETABLE_CONFIG_STATUSES,
      });

    return new Set(validPeriodIds);
  }

  async isPeriodValidForAttendanceContext(input: {
    academicYearId: string;
    termId: string;
    periodId: string;
  }): Promise<boolean> {
    const validPeriodIds = await this.findValidPeriodIdsForAttendanceContext({
      academicYearId: input.academicYearId,
      termId: input.termId,
      periodIds: [input.periodId],
    });

    return validPeriodIds.has(input.periodId);
  }
}
