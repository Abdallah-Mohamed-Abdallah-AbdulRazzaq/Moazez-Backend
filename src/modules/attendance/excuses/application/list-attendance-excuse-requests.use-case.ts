import { Injectable } from '@nestjs/common';
import { ListAttendanceExcuseRequestsQueryDto } from '../dto/attendance-excuse.dto';
import { resolveExcuseAcademicYearId } from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseRequests } from '../presenters/attendance-excuse.presenter';
import { parseExcuseListDateFilters } from './attendance-excuse-use-case.helpers';

@Injectable()
export class ListAttendanceExcuseRequestsUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
  ) {}

  async execute(query: ListAttendanceExcuseRequestsQueryDto) {
    const dateFilters = parseExcuseListDateFilters(query);
    const requests = await this.attendanceExcusesRepository.list({
      academicYearId:
        query.academicYearId || query.yearId
          ? resolveExcuseAcademicYearId(query)
          : undefined,
      termId: query.termId,
      studentId: query.studentId,
      status: query.status,
      type: query.type,
      search: query.search,
      ...dateFilters,
    });

    return presentAttendanceExcuseRequests(requests);
  }
}
