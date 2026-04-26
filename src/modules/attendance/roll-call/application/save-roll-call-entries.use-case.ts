import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAttendanceScope } from '../../attendance-context';
import {
  SaveRollCallEntriesDto,
  SaveRollCallEntryDto,
} from '../dto/attendance-roll-call.dto';
import { assertDraftAttendanceSession } from '../domain/session-key';
import {
  AttendanceRollCallRepository,
  RollCallEntryUpsertInput,
  RollCallRosterEnrollmentRecord,
} from '../infrastructure/attendance-roll-call.repository';
import { presentSavedRollCallEntries } from '../presenters/attendance-roll-call.presenter';
import { scopeFromSession } from './roll-call-use-case.helpers';

@Injectable()
export class SaveRollCallEntriesUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
  ) {}

  async execute(sessionId: string, command: SaveRollCallEntriesDto) {
    const result = await this.save(sessionId, command.entries);
    return presentSavedRollCallEntries(result);
  }

  async save(sessionId: string, entries: SaveRollCallEntryDto[]) {
    const attendanceScope = requireAttendanceScope();
    const session = await this.attendanceRollCallRepository.findSessionById(
      sessionId,
    );
    if (!session) {
      throw new NotFoundDomainException('Attendance session not found', {
        sessionId,
      });
    }

    assertDraftAttendanceSession({
      sessionId: session.id,
      status: session.status,
    });

    const roster = await this.attendanceRollCallRepository.listRosterStudents({
      academicYearId: session.academicYearId,
      termId: session.termId,
      scope: scopeFromSession(session),
    });
    const normalizedEntries = normalizeEntriesForRoster(entries, roster);
    const savedEntries =
      await this.attendanceRollCallRepository.bulkUpsertEntries({
        schoolId: session.schoolId,
        sessionId: session.id,
        markedById: attendanceScope.actorId,
        markedAt: new Date(),
        entries: normalizedEntries,
      });

    return { session, entries: savedEntries };
  }
}

function normalizeEntriesForRoster(
  entries: SaveRollCallEntryDto[],
  roster: RollCallRosterEnrollmentRecord[],
): RollCallEntryUpsertInput[] {
  const rosterByStudentId = new Map(
    roster.map((enrollment) => [enrollment.studentId, enrollment]),
  );
  const seenStudentIds = new Set<string>();

  return entries.map((entry) => {
    if (seenStudentIds.has(entry.studentId)) {
      throw new ValidationDomainException(
        'Attendance entries contain duplicate student ids',
        { studentId: entry.studentId },
      );
    }
    seenStudentIds.add(entry.studentId);

    const rosterEnrollment = rosterByStudentId.get(entry.studentId);
    if (!rosterEnrollment) {
      throw new NotFoundDomainException('Student not found in attendance roster', {
        studentId: entry.studentId,
      });
    }

    if (
      entry.enrollmentId &&
      entry.enrollmentId !== rosterEnrollment.id
    ) {
      throw new NotFoundDomainException(
        'Enrollment not found in attendance roster',
        { enrollmentId: entry.enrollmentId },
      );
    }

    return {
      studentId: entry.studentId,
      enrollmentId: entry.enrollmentId ?? rosterEnrollment.id,
      status: entry.status,
      lateMinutes: entry.lateMinutes ?? null,
      earlyLeaveMinutes: entry.earlyLeaveMinutes ?? null,
      excuseReason: normalizeOptionalString(entry.excuseReason),
      note: normalizeOptionalString(entry.note),
    };
  });
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
