import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { LinkAttendanceExcuseAttachmentsDto } from '../dto/attendance-excuse.dto';
import {
  assertExcuseTermWritable,
  assertPendingExcuseRequest,
} from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseAttachments } from '../presenters/attendance-excuse.presenter';
import {
  buildExcuseAttachmentAuditEntry,
  normalizeAttachmentFileIds,
  validateExcuseAcademicContext,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class LinkAttendanceExcuseAttachmentsUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    excuseRequestId: string,
    command: LinkAttendanceExcuseAttachmentsDto,
  ) {
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

    const fileIds = normalizeAttachmentFileIds(command.fileIds);
    const scopedFileIds =
      await this.attendanceExcusesRepository.findScopedFileIds(fileIds);
    const scopedFileIdSet = new Set(scopedFileIds);
    if (fileIds.some((fileId) => !scopedFileIdSet.has(fileId))) {
      throw new FilesNotFoundException({ fileIds });
    }

    const attachments =
      await this.attendanceExcusesRepository.linkFilesToExcuseRequest({
        excuseRequestId: request.id,
        fileIds,
        schoolId: scope.schoolId,
        createdById: scope.actorId,
      });

    await this.authRepository.createAuditLog(
      buildExcuseAttachmentAuditEntry({
        scope,
        action: 'attendance.excuse.attachment.add',
        request,
        attachments,
      }),
    );

    return presentAttendanceExcuseAttachments(attachments);
  }
}
