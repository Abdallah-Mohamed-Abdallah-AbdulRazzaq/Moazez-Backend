import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { UpdateAttendanceExcuseRequestDto } from '../dto/attendance-excuse.dto';
import { assertPendingExcuseRequest } from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';
import {
  buildExcuseAuditEntry,
  buildUpdateExcuseRequestData,
  validateExcuseAcademicContext,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class UpdateAttendanceExcuseRequestUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    excuseRequestId: string,
    command: UpdateAttendanceExcuseRequestDto,
  ) {
    const scope = requireAttendanceScope();
    const existing =
      await this.attendanceExcusesRepository.findById(excuseRequestId);
    if (!existing) {
      throw new NotFoundDomainException('Attendance excuse request not found', {
        excuseRequestId,
      });
    }

    assertPendingExcuseRequest(existing);

    const { term } = await validateExcuseAcademicContext(
      this.attendanceExcusesRepository,
      existing.academicYearId,
      existing.termId,
    );
    const updated = await this.attendanceExcusesRepository.update(
      existing.id,
      buildUpdateExcuseRequestData({ existing, command, term }),
    );

    await this.authRepository.createAuditLog(
      buildExcuseAuditEntry({
        scope,
        action: 'attendance.excuse_request.update',
        request: updated,
        before: existing,
      }),
    );

    return presentAttendanceExcuseRequest(updated);
  }
}
