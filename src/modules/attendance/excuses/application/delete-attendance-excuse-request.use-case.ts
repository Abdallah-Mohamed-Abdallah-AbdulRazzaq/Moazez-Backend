import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { DeleteAttendanceExcuseRequestResponseDto } from '../dto/attendance-excuse.dto';
import {
  assertExcuseTermWritable,
  assertPendingExcuseRequest,
} from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import {
  buildExcuseAuditEntry,
  validateExcuseAcademicContext,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class DeleteAttendanceExcuseRequestUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    excuseRequestId: string,
  ): Promise<DeleteAttendanceExcuseRequestResponseDto> {
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
    assertExcuseTermWritable(term);

    const deleted = await this.attendanceExcusesRepository.softDelete(
      existing.id,
    );

    await this.authRepository.createAuditLog(
      buildExcuseAuditEntry({
        scope,
        action: 'attendance.excuse_request.cancel',
        request: deleted,
        before: existing,
      }),
    );

    return { ok: true };
  }
}
