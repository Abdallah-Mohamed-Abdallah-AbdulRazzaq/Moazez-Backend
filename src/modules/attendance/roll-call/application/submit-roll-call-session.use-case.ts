import { Injectable, Logger, Optional } from '@nestjs/common';
import { AttendanceSessionStatus, AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { AttendanceSessionAlreadySubmittedException } from '../domain/roll-call.exceptions';
import {
  AttendanceRollCallRepository,
  RollCallSessionDetailRecord,
} from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallSession } from '../presenters/attendance-roll-call.presenter';
import { AttendanceGuardianAbsenceNotificationService } from './attendance-guardian-absence-notification.service';
import { assertRollCallSessionTermWritable } from './roll-call-use-case.helpers';

@Injectable()
export class SubmitRollCallSessionUseCase {
  private readonly logger = new Logger(SubmitRollCallSessionUseCase.name);

  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
    private readonly authRepository: AuthRepository,
    @Optional()
    private readonly guardianAbsenceNotificationService?: AttendanceGuardianAbsenceNotificationService,
  ) {}

  async execute(sessionId: string) {
    const scope = requireAttendanceScope();
    const session =
      await this.attendanceRollCallRepository.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundDomainException('Attendance session not found', {
        sessionId,
      });
    }

    assertRollCallSessionTermWritable(session);

    if (session.status !== AttendanceSessionStatus.DRAFT) {
      throw new AttendanceSessionAlreadySubmittedException({
        sessionId: session.id,
        status: session.status,
      });
    }

    const submittedAt = new Date();
    const submitted = await this.attendanceRollCallRepository.submitSession({
      sessionId: session.id,
      schoolId: session.schoolId,
      submittedAt,
      submittedById: scope.actorId,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'attendance',
      action: 'attendance.session.submit',
      resourceType: 'attendance_session',
      resourceId: submitted.id,
      outcome: AuditOutcome.SUCCESS,
      before: summarizeSessionSubmission(session),
      after: summarizeSessionSubmission(submitted),
    });

    await this.notifyGuardianAbsencesSafely(submitted);

    return presentRollCallSession(submitted);
  }

  private async notifyGuardianAbsencesSafely(
    submitted: RollCallSessionDetailRecord,
  ): Promise<void> {
    if (!this.guardianAbsenceNotificationService) return;

    try {
      await this.guardianAbsenceNotificationService.notifySubmittedAbsences(
        submitted,
      );
    } catch (error) {
      const errorName = error instanceof Error ? error.name : typeof error;
      this.logger.warn(
        `Guardian absence notification side effect skipped after failure (${errorName})`,
      );
    }
  }
}

function summarizeSessionSubmission(session: RollCallSessionDetailRecord) {
  return {
    status: session.status,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    submittedById: session.submittedById,
  };
}
