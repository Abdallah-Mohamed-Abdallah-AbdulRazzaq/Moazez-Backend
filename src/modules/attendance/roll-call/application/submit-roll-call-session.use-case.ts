import { Injectable } from '@nestjs/common';
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

@Injectable()
export class SubmitRollCallSessionUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
    private readonly authRepository: AuthRepository,
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

    return presentRollCallSession(submitted);
  }
}

function summarizeSessionSubmission(session: RollCallSessionDetailRecord) {
  return {
    status: session.status,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    submittedById: session.submittedById,
  };
}
