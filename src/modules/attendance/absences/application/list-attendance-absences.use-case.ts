import { Injectable } from '@nestjs/common';
import { isAttendanceIncidentStatus } from '../domain/attendance-incident';
import { ListAttendanceAbsencesQueryDto } from '../dto/attendance-absences.dto';
import { AttendanceAbsencesRepository } from '../infrastructure/attendance-absences.repository';
import { presentAttendanceAbsences } from '../presenters/attendance-absences.presenter';
import { buildAttendanceAbsenceFilters } from './attendance-absences-use-case.helpers';

@Injectable()
export class ListAttendanceAbsencesUseCase {
  constructor(
    private readonly attendanceAbsencesRepository: AttendanceAbsencesRepository,
  ) {}

  async execute(query: ListAttendanceAbsencesQueryDto) {
    const filters = await buildAttendanceAbsenceFilters(
      this.attendanceAbsencesRepository,
      query,
    );
    const incidents =
      await this.attendanceAbsencesRepository.listIncidents(filters);

    return presentAttendanceAbsences(
      incidents.filter((incident) =>
        isAttendanceIncidentStatus(incident.status),
      ),
    );
  }
}
