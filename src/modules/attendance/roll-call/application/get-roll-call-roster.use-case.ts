import { Injectable } from '@nestjs/common';
import { AttendanceMode } from '@prisma/client';
import { RollCallRosterQueryDto } from '../dto/attendance-roll-call.dto';
import { normalizeAttendancePeriodKey } from '../domain/session-key';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallRoster } from '../presenters/attendance-roll-call.presenter';
import {
  resolveRollCallAcademicYearId,
  resolveRollCallScope,
  resolveRosterSessionDate,
  validateRollCallAcademicContext,
} from './roll-call-use-case.helpers';

@Injectable()
export class GetRollCallRosterUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
  ) {}

  async execute(query: RollCallRosterQueryDto) {
    const academicYearId = resolveRollCallAcademicYearId(query);
    await validateRollCallAcademicContext(
      this.attendanceRollCallRepository,
      academicYearId,
      query.termId,
    );

    const date = resolveRosterSessionDate(query);
    const scope = await resolveRollCallScope(
      this.attendanceRollCallRepository,
      query,
    );
    const roster = await this.attendanceRollCallRepository.listRosterStudents({
      academicYearId,
      termId: query.termId,
      scope,
    });

    const mode = query.mode ?? AttendanceMode.DAILY;
    const periodKey = normalizeAttendancePeriodKey({
      mode,
      periodKey: query.periodKey,
    });
    const session = await this.attendanceRollCallRepository.findSessionByKey({
      academicYearId,
      termId: query.termId,
      date,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      mode,
      periodKey,
    });

    return presentRollCallRoster({ roster, session });
  }
}
