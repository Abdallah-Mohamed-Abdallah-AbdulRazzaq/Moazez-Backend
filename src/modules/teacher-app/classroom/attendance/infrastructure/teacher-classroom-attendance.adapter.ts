import { Injectable } from '@nestjs/common';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { GetRollCallRosterUseCase } from '../../../../attendance/roll-call/application/get-roll-call-roster.use-case';
import { GetRollCallSessionDetailUseCase } from '../../../../attendance/roll-call/application/get-roll-call-session-detail.use-case';
import { ResolveRollCallSessionUseCase } from '../../../../attendance/roll-call/application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from '../../../../attendance/roll-call/application/save-roll-call-entries.use-case';
import { SubmitRollCallSessionUseCase } from '../../../../attendance/roll-call/application/submit-roll-call-session.use-case';
import {
  RollCallRosterResponseDto,
  RollCallSessionResponseDto,
  SaveRollCallEntriesResponseDto,
} from '../../../../attendance/roll-call/dto/attendance-roll-call.dto';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { UpdateTeacherClassroomAttendanceEntryDto } from '../dto/teacher-classroom-attendance.dto';

@Injectable()
export class TeacherClassroomAttendanceAdapter {
  constructor(
    private readonly getRollCallRosterUseCase: GetRollCallRosterUseCase,
    private readonly resolveRollCallSessionUseCase: ResolveRollCallSessionUseCase,
    private readonly getRollCallSessionDetailUseCase: GetRollCallSessionDetailUseCase,
    private readonly saveRollCallEntriesUseCase: SaveRollCallEntriesUseCase,
    private readonly submitRollCallSessionUseCase: SubmitRollCallSessionUseCase,
  ) {}

  getRoster(params: {
    allocation: TeacherAppAllocationRecord;
    date: string;
  }): Promise<RollCallRosterResponseDto> {
    return this.getRollCallRosterUseCase.execute(
      buildClassroomRollCallQuery(params.allocation, params.date),
    );
  }

  async resolveSession(params: {
    allocation: TeacherAppAllocationRecord;
    date: string;
  }): Promise<RollCallSessionResponseDto> {
    const result = await this.resolveRollCallSessionUseCase.execute({
      ...buildClassroomRollCallQuery(params.allocation, params.date),
      mode: AttendanceMode.DAILY,
    });

    assertSessionBelongsToAllocation({
      allocation: params.allocation,
      session: result,
    });

    return result;
  }

  async getSession(params: {
    allocation: TeacherAppAllocationRecord;
    sessionId: string;
  }): Promise<RollCallSessionResponseDto> {
    const result = await this.getRollCallSessionDetailUseCase.execute(
      params.sessionId,
    );

    assertSessionBelongsToAllocation({
      allocation: params.allocation,
      session: result,
      sessionId: params.sessionId,
    });

    return result;
  }

  async updateEntries(params: {
    allocation: TeacherAppAllocationRecord;
    sessionId: string;
    entries: UpdateTeacherClassroomAttendanceEntryDto[];
  }): Promise<SaveRollCallEntriesResponseDto> {
    const session = await this.getSession({
      allocation: params.allocation,
      sessionId: params.sessionId,
    });

    await this.assertStudentsBelongToSessionRoster({
      allocation: params.allocation,
      session,
      entries: params.entries,
    });

    const result = await this.saveRollCallEntriesUseCase.execute(
      params.sessionId,
      {
        entries: params.entries.map((entry) => ({
          studentId: entry.studentId,
          status: toCoreAttendanceStatus(entry.status),
          note: normalizeOptionalString(entry.note),
        })),
      },
    );

    assertSessionBelongsToAllocation({
      allocation: params.allocation,
      session: result,
      sessionId: params.sessionId,
    });

    return result;
  }

  async submitSession(params: {
    allocation: TeacherAppAllocationRecord;
    sessionId: string;
  }): Promise<RollCallSessionResponseDto> {
    await this.getSession({
      allocation: params.allocation,
      sessionId: params.sessionId,
    });

    const result = await this.submitRollCallSessionUseCase.execute(
      params.sessionId,
    );

    assertSessionBelongsToAllocation({
      allocation: params.allocation,
      session: result,
      sessionId: params.sessionId,
    });

    return result;
  }

  private async assertStudentsBelongToSessionRoster(params: {
    allocation: TeacherAppAllocationRecord;
    session: RollCallSessionResponseDto;
    entries: UpdateTeacherClassroomAttendanceEntryDto[];
  }): Promise<void> {
    const roster = await this.getRoster({
      allocation: params.allocation,
      date: params.session.session.date,
    });
    const studentIds = new Set(roster.items.map((student) => student.studentId));

    for (const entry of params.entries) {
      if (!studentIds.has(entry.studentId)) {
        throw new NotFoundDomainException(
          'Student not found in attendance roster',
          { studentId: entry.studentId },
        );
      }
    }
  }
}

function buildClassroomRollCallQuery(
  allocation: TeacherAppAllocationRecord,
  date: string,
) {
  const academicYearId = allocation.term?.academicYearId;
  if (!academicYearId) {
    throw new NotFoundDomainException('Teacher App class allocation was not found', {
      classId: allocation.id,
      relation: 'term',
    });
  }

  return {
    academicYearId,
    termId: allocation.termId,
    date,
    scopeType: AttendanceScopeType.CLASSROOM,
    classroomId: allocation.classroomId,
    mode: AttendanceMode.DAILY,
  };
}

function assertSessionBelongsToAllocation(params: {
  allocation: TeacherAppAllocationRecord;
  session: RollCallSessionResponseDto | SaveRollCallEntriesResponseDto;
  sessionId?: string;
}): void {
  const session = params.session.session;
  const scopeIds = session.scopeIds;

  if (
    session.scopeType !== AttendanceScopeType.CLASSROOM ||
    scopeIds?.classroomId !== params.allocation.classroomId ||
    session.termId !== params.allocation.termId ||
    session.academicYearId !== params.allocation.term?.academicYearId
  ) {
    throw new NotFoundDomainException('Attendance session not found', {
      sessionId: params.sessionId ?? session.id,
    });
  }
}

function toCoreAttendanceStatus(
  status: UpdateTeacherClassroomAttendanceEntryDto['status'],
): AttendanceStatus {
  switch (status) {
    case 'present':
      return AttendanceStatus.PRESENT;
    case 'absent':
      return AttendanceStatus.ABSENT;
    case 'late':
      return AttendanceStatus.LATE;
    case 'excused':
      return AttendanceStatus.EXCUSED;
  }
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
