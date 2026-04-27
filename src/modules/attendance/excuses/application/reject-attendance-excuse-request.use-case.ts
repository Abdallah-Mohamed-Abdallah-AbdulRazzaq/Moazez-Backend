import { Injectable } from '@nestjs/common';
import { AttendanceExcuseStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { ReviewAttendanceExcuseRequestDto } from '../dto/attendance-excuse.dto';
import { assertPendingForReview } from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';
import {
  buildExcuseReviewAuditEntry,
  normalizeExcuseReviewCommand,
  validateExcuseAcademicContext,
  validateExcuseStudent,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class RejectAttendanceExcuseRequestUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    excuseRequestId: string,
    command: ReviewAttendanceExcuseRequestDto,
  ) {
    const scope = requireAttendanceScope();
    const existing =
      await this.attendanceExcusesRepository.findById(excuseRequestId);
    if (!existing) {
      throw new NotFoundDomainException('Attendance excuse request not found', {
        excuseRequestId,
      });
    }

    assertPendingForReview(existing);
    await validateExcuseAcademicContext(
      this.attendanceExcusesRepository,
      existing.academicYearId,
      existing.termId,
    );
    await validateExcuseStudent(
      this.attendanceExcusesRepository,
      existing.studentId,
    );

    const reviewCommand = normalizeExcuseReviewCommand(command);
    const rejected = await this.attendanceExcusesRepository.rejectRequest({
      excuseRequestId: existing.id,
      review: {
        status: AttendanceExcuseStatus.REJECTED,
        decidedById: scope.actorId,
        decidedAt: new Date(),
        decisionNote: reviewCommand.decisionNote,
      },
    });
    const attachmentCount =
      await this.attendanceExcusesRepository.countAttachmentsForExcuseRequest(
        existing.id,
      );

    await this.authRepository.createAuditLog(
      buildExcuseReviewAuditEntry({
        scope,
        action: 'attendance.excuse.reject',
        request: rejected,
        before: existing,
      }),
    );

    return presentAttendanceExcuseRequest(rejected, { attachmentCount });
  }
}
