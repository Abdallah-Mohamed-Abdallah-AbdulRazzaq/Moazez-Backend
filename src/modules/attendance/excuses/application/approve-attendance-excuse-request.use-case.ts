import { Injectable } from '@nestjs/common';
import { AttendanceExcuseStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { ReviewAttendanceExcuseRequestDto } from '../dto/attendance-excuse.dto';
import {
  assertExcuseAttachmentRequirement,
  assertMatchingSubmittedEntriesExist,
  assertPendingForReview,
  attendanceStatusForExcuseType,
  validateAndNormalizeExcuseValues,
} from '../domain/excuse-validation';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';
import {
  buildExcuseApprovalReason,
  buildExcuseReviewAuditEntry,
  normalizeExcuseReviewCommand,
  uniqueAffectedSessionIds,
  validateExcuseAcademicContext,
  validateExcuseStudent,
} from './attendance-excuse-use-case.helpers';

@Injectable()
export class ApproveAttendanceExcuseRequestUseCase {
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
    const { term } = await validateExcuseAcademicContext(
      this.attendanceExcusesRepository,
      existing.academicYearId,
      existing.termId,
    );
    await validateExcuseStudent(
      this.attendanceExcusesRepository,
      existing.studentId,
    );
    validateAndNormalizeExcuseValues(
      {
        type: existing.type,
        dateFrom: existing.dateFrom,
        dateTo: existing.dateTo,
        selectedPeriodKeys: existing.selectedPeriodKeys,
        lateMinutes: existing.lateMinutes,
        earlyLeaveMinutes: existing.earlyLeaveMinutes,
        reasonAr: existing.reasonAr,
        reasonEn: existing.reasonEn,
      },
      term,
    );

    const reviewCommand = normalizeExcuseReviewCommand(command);
    const expectedEntryStatus = attendanceStatusForExcuseType(existing.type);
    const matchingSessions =
      await this.attendanceExcusesRepository.findMatchingSubmittedSessions({
        request: existing,
      });
    const matchingEntries =
      await this.attendanceExcusesRepository.findMatchingEntriesForExcuse({
        sessionIds: matchingSessions.map((session) => session.id),
        studentId: existing.studentId,
        expectedStatus: expectedEntryStatus,
      });

    assertMatchingSubmittedEntriesExist({
      excuseRequestId: existing.id,
      matchingEntryCount: matchingEntries.length,
    });

    const affectedSessionIds = uniqueAffectedSessionIds(matchingEntries);
    const affectedSessionIdSet = new Set(affectedSessionIds);
    const requiresAttachment = matchingSessions
      .filter((session) => affectedSessionIdSet.has(session.id))
      .some((session) => session.policy?.requireExcuseAttachment === true);
    const attachmentCount =
      await this.attendanceExcusesRepository.countAttachmentsForExcuseRequest(
        existing.id,
      );

    assertExcuseAttachmentRequirement({
      excuseRequestId: existing.id,
      requiresAttachment,
      attachmentCount,
    });

    const affectedEntryIds = matchingEntries.map((entry) => entry.id);
    const approved =
      await this.attendanceExcusesRepository.approveRequestAndApplyEntries({
        excuseRequestId: existing.id,
        schoolId: scope.schoolId,
        review: {
          status: AttendanceExcuseStatus.APPROVED,
          decidedById: scope.actorId,
          decidedAt: new Date(),
          decisionNote: reviewCommand.decisionNote,
        },
        affectedSessionIds,
        affectedEntryIds,
        studentId: existing.studentId,
        expectedStatus: expectedEntryStatus,
        excuseReason: buildExcuseApprovalReason({
          request: existing,
          decisionNote: reviewCommand.decisionNote,
        }),
      });

    await this.authRepository.createAuditLog(
      buildExcuseReviewAuditEntry({
        scope,
        action: 'attendance.excuse.approve',
        request: approved,
        before: existing,
        affectedSessionIds,
        affectedEntryIds,
      }),
    );

    return presentAttendanceExcuseRequest(approved, { attachmentCount });
  }
}
