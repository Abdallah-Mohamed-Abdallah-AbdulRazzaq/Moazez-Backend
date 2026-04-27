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
  buildExcuseAttachmentAuditEntry,
  validateExcuseAcademicContext,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class DeleteAttendanceExcuseAttachmentUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    excuseRequestId: string,
    attachmentId: string,
  ): Promise<DeleteAttendanceExcuseRequestResponseDto> {
    const scope = requireAttendanceScope();
    const request =
      await this.attendanceExcusesRepository.findById(excuseRequestId);
    if (!request) {
      throw new NotFoundDomainException('Attendance excuse request not found', {
        excuseRequestId,
      });
    }

    assertPendingExcuseRequest(request);
    const { term } = await validateExcuseAcademicContext(
      this.attendanceExcusesRepository,
      request.academicYearId,
      request.termId,
    );
    assertExcuseTermWritable(term);

    const attachment =
      await this.attendanceExcusesRepository.findAttachmentForExcuseRequest({
        excuseRequestId: request.id,
        attachmentId,
      });
    if (!attachment) {
      throw new NotFoundDomainException('Attachment not found', {
        attachmentId,
      });
    }

    const result =
      await this.attendanceExcusesRepository.deleteAttachmentForExcuseRequest({
        excuseRequestId: request.id,
        attachmentId,
      });
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Attachment not found', {
        attachmentId,
      });
    }

    await this.authRepository.createAuditLog(
      buildExcuseAttachmentAuditEntry({
        scope,
        action: 'attendance.excuse.attachment.remove',
        request,
        attachments: [],
        before: attachment,
      }),
    );

    return { ok: true };
  }
}
