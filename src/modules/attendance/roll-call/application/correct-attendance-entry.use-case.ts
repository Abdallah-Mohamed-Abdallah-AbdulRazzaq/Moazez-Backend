import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { CorrectAttendanceEntryDto } from '../dto/attendance-roll-call.dto';
import {
  assertSubmittedSessionForCorrection,
  normalizeEntryCorrection,
  summarizeEntryCorrectionState,
} from '../domain/entry-correction';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallEntry } from '../presenters/attendance-roll-call.presenter';

@Injectable()
export class CorrectAttendanceEntryUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    sessionId: string,
    studentId: string,
    command: CorrectAttendanceEntryDto,
  ) {
    const scope = requireAttendanceScope();
    const { session, entry } =
      await this.attendanceRollCallRepository.findSessionEntryForCorrection({
        sessionId,
        studentId,
      });

    if (!session) {
      throw new NotFoundDomainException('Attendance session not found', {
        sessionId,
      });
    }

    assertSubmittedSessionForCorrection({
      sessionId: session.id,
      status: session.status,
    });

    if (!entry) {
      throw new NotFoundDomainException('Attendance entry not found', {
        sessionId: session.id,
        studentId,
      });
    }

    const correction = normalizeEntryCorrection(command, entry);
    const markedAt = new Date();
    const corrected =
      await this.attendanceRollCallRepository.correctSubmittedEntry({
        entryId: entry.id,
        sessionId: session.id,
        studentId: entry.studentId,
        correction: {
          status: correction.status,
          lateMinutes: correction.lateMinutes,
          earlyLeaveMinutes: correction.earlyLeaveMinutes,
          excuseReason: correction.excuseReason,
          note: correction.note,
        },
        markedById: scope.actorId,
        markedAt,
      });

    if (!corrected) {
      throw new NotFoundDomainException('Attendance entry not found', {
        entryId: entry.id,
        sessionId: session.id,
        studentId: entry.studentId,
      });
    }

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'attendance',
      action: 'attendance.entry.correct',
      resourceType: 'attendance_entry',
      resourceId: corrected.id,
      outcome: AuditOutcome.SUCCESS,
      before: summarizeEntryCorrectionState(entry),
      after: {
        ...summarizeEntryCorrectionState(corrected),
        correctionReason: correction.correctionReason,
      },
    });

    return presentRollCallEntry(corrected);
  }
}
