import { Injectable } from '@nestjs/common';
import { summarizeAttendanceIncidents } from '../domain/attendance-incident';
import { AttendanceAbsenceSummaryQueryDto } from '../dto/attendance-absences.dto';
import { AttendanceAbsencesRepository } from '../infrastructure/attendance-absences.repository';
import { presentAttendanceAbsenceSummary } from '../presenters/attendance-absences.presenter';
import { buildAttendanceAbsenceFilters } from './attendance-absences-use-case.helpers';

@Injectable()
export class GetAttendanceAbsenceSummaryUseCase {
  constructor(
    private readonly attendanceAbsencesRepository: AttendanceAbsencesRepository,
  ) {}

  async execute(query: AttendanceAbsenceSummaryQueryDto) {
    const filters = await buildAttendanceAbsenceFilters(
      this.attendanceAbsencesRepository,
      query,
    );
    const incidents =
      await this.attendanceAbsencesRepository.getIncidentSummary(filters);

    return presentAttendanceAbsenceSummary(
      summarizeAttendanceIncidents(incidents),
    );
  }
}
