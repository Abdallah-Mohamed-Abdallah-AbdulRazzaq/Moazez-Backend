import { Injectable } from '@nestjs/common';
import { AttendanceStatus, AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAttendanceScope } from '../../attendance-context';
import { assertRollCallSessionTermWritable } from '../../roll-call/application/roll-call-use-case.helpers';
import {
  assertSubmittedSessionForCorrection,
  normalizeEntryCorrection,
  summarizeEntryCorrectionState,
} from '../../roll-call/domain/entry-correction';
import { CorrectAttendanceAbsenceEarlyLeaveDto } from '../dto/attendance-absences.dto';
import { assertAttendanceIncidentCanBecomeEarlyLeave } from '../domain/attendance-incident';
import { AttendanceAbsencesRepository } from '../infrastructure/attendance-absences.repository';
import { presentAttendanceAbsenceIncident } from '../presenters/attendance-absences.presenter';

@Injectable()
export class CorrectAttendanceAbsenceEarlyLeaveUseCase {
  constructor(
    private readonly attendanceAbsencesRepository: AttendanceAbsencesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    entryId: string,
    command: CorrectAttendanceAbsenceEarlyLeaveDto,
  ) {
    const scope = requireAttendanceScope();
    const incident =
      await this.attendanceAbsencesRepository.findIncidentById(entryId);

    if (!incident) {
      throw new NotFoundDomainException('Attendance absence incident not found', {
        entryId,
      });
    }

    assertRollCallSessionTermWritable(incident.session);
    assertSubmittedSessionForCorrection({
      sessionId: incident.session.id,
      status: incident.session.status,
    });
    assertAttendanceIncidentCanBecomeEarlyLeave(incident.status);

    const correction = normalizeEntryCorrection(
      {
        status: AttendanceStatus.EARLY_LEAVE,
        earlyLeaveMinutes: command.earlyLeaveMinutes,
        note: command.note,
        correctionReason: command.correctionReason,
      },
      incident,
    );
    const markedAt = new Date();
    const corrected =
      await this.attendanceAbsencesRepository.correctIncidentEntry({
        entryId: incident.id,
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
      throw new NotFoundDomainException('Attendance absence incident not found', {
        entryId: incident.id,
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
      before: summarizeEntryCorrectionState(incident),
      after: {
        ...summarizeEntryCorrectionState(corrected),
        correctionReason: correction.correctionReason,
        correctionSource: 'attendance.absences.early_leave',
      },
    });

    return presentAttendanceAbsenceIncident(corrected);
  }
}
