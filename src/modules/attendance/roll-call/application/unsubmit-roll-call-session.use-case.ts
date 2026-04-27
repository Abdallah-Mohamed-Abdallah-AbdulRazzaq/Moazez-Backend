import { Injectable } from '@nestjs/common';
import { AttendanceSessionStatus, AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { AttendanceSessionNotSubmittedException } from '../domain/roll-call.exceptions';
import {
  AttendanceRollCallRepository,
  RollCallSessionDetailRecord,
} from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallSession } from '../presenters/attendance-roll-call.presenter';

@Injectable()
export class UnsubmitRollCallSessionUseCase {
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

    if (session.status !== AttendanceSessionStatus.SUBMITTED) {
      throw new AttendanceSessionNotSubmittedException({
        sessionId: session.id,
        status: session.status,
      });
    }

    const unsubmitted = await this.attendanceRollCallRepository.unsubmitSession(
      {
        sessionId: session.id,
        schoolId: session.schoolId,
      },
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'attendance',
      action: 'attendance.session.unsubmit',
      resourceType: 'attendance_session',
      resourceId: unsubmitted.id,
      outcome: AuditOutcome.SUCCESS,
      before: summarizeSessionSubmission(session),
      after: summarizeSessionSubmission(unsubmitted),
    });

    return presentRollCallSession(unsubmitted);
  }
}

function summarizeSessionSubmission(session: RollCallSessionDetailRecord) {
  return {
    status: session.status,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    submittedById: session.submittedById,
  };
}
