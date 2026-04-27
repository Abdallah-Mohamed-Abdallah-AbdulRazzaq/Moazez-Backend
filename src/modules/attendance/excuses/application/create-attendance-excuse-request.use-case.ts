import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { CreateAttendanceExcuseRequestDto } from '../dto/attendance-excuse.dto';
import { resolveExcuseAcademicYearId } from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';
import {
  buildCreateExcuseRequestData,
  buildExcuseAuditEntry,
  validateExcuseAcademicContext,
  validateExcuseStudent,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class CreateAttendanceExcuseRequestUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateAttendanceExcuseRequestDto) {
    const scope = requireAttendanceScope();
    const academicYearId = resolveExcuseAcademicYearId(command);
    const { term } = await validateExcuseAcademicContext(
      this.attendanceExcusesRepository,
      academicYearId,
      command.termId,
    );
    await validateExcuseStudent(
      this.attendanceExcusesRepository,
      command.studentId,
    );

    const request = await this.attendanceExcusesRepository.create(
      buildCreateExcuseRequestData({
        scope,
        academicYearId,
        command,
        term,
      }),
    );

    await this.authRepository.createAuditLog(
      buildExcuseAuditEntry({
        scope,
        action: 'attendance.excuse_request.create',
        request,
      }),
    );

    return presentAttendanceExcuseRequest(request);
  }
}
