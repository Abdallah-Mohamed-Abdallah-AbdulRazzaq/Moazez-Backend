import { Injectable } from '@nestjs/common';
import { ListRollCallSessionsQueryDto } from '../dto/attendance-roll-call.dto';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallSessions } from '../presenters/attendance-roll-call.presenter';
import {
  resolveListDateFilters,
  resolveOptionalRollCallListScope,
  validateOptionalRollCallListContext,
} from './roll-call-use-case.helpers';

@Injectable()
export class ListRollCallSessionsUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
  ) {}

  async execute(query: ListRollCallSessionsQueryDto) {
    await validateOptionalRollCallListContext(
      this.attendanceRollCallRepository,
      query,
    );

    const resolvedScope = await resolveOptionalRollCallListScope(
      this.attendanceRollCallRepository,
      query,
    );
    const dates = resolveListDateFilters(query);
    const sessions = await this.attendanceRollCallRepository.listSessions({
      academicYearId: query.academicYearId ?? query.yearId,
      termId: query.termId,
      ...dates,
      scopeType: query.scopeType,
      scopeKey: query.scopeKey ?? resolvedScope?.scopeKey,
      stageId: resolvedScope?.stageId ?? query.stageId,
      gradeId: resolvedScope?.gradeId ?? query.gradeId,
      sectionId: resolvedScope?.sectionId ?? query.sectionId,
      classroomId: resolvedScope?.classroomId ?? query.classroomId,
      status: query.status,
      mode: query.mode,
    });

    return presentRollCallSessions(sessions);
  }
}
