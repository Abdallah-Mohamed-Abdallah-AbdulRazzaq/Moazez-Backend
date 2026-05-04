import {
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
import {
  RollCallRosterResponseDto,
  RollCallSessionResponseDto,
  SaveRollCallEntriesResponseDto,
} from '../../../../attendance/roll-call/dto/attendance-roll-call.dto';
import {
  TeacherClassroomAttendanceEntryResponseDto,
  TeacherClassroomAttendancePaginationDto,
  TeacherClassroomAttendanceRosterResponseDto,
  TeacherClassroomAttendanceSessionDto,
  TeacherClassroomAttendanceSessionResponseDto,
  TeacherClassroomAttendanceStatus,
} from '../dto/teacher-classroom-attendance.dto';

const DEFAULT_ROSTER_LIMIT = 20;
const MAX_ROSTER_LIMIT = 100;

export interface TeacherClassroomAttendanceRosterPresenterInput {
  classId: string;
  date: string;
  roster: RollCallRosterResponseDto;
  filters?: {
    search?: string;
    page?: number;
    limit?: number;
  };
}

export class TeacherClassroomAttendancePresenter {
  static presentRoster(
    input: TeacherClassroomAttendanceRosterPresenterInput,
  ): TeacherClassroomAttendanceRosterResponseDto {
    const page = resolvePage(input.filters?.page);
    const limit = resolveLimit(input.filters?.limit);
    const filtered = filterRoster(input.roster, input.filters?.search);
    const paged = filtered.slice((page - 1) * limit, page * limit);

    return {
      classId: input.classId,
      date: normalizeDateOnly(input.date),
      session: input.roster.session
        ? presentSession(input.roster.session)
        : null,
      students: paged.map((student) => ({
        id: student.studentId,
        displayName: student.name,
        status: 'active',
        attendanceStatus: toTeacherAttendanceStatus(student.currentStatus),
        arrivalTime: null,
        dismissalTime: null,
        note: student.note,
      })),
      pagination: presentPagination({
        page,
        limit,
        total: filtered.length,
      }),
    };
  }

  static presentSession(params: {
    classId: string;
    result: RollCallSessionResponseDto | SaveRollCallEntriesResponseDto;
  }): TeacherClassroomAttendanceSessionResponseDto {
    return {
      classId: params.classId,
      date: params.result.session.date,
      session: presentSession(params.result.session),
      entries: params.result.entries.map((entry) => ({
        id: entry.id,
        studentId: entry.studentId,
        displayName: entry.student?.name ?? null,
        attendanceStatus: toTeacherAttendanceStatus(entry.status),
        arrivalTime: null,
        dismissalTime: null,
        note: entry.note,
        markedAt: entry.markedAt,
      })),
    };
  }
}

function presentSession(session: {
  id: string;
  status: AttendanceSessionStatus;
  submittedAt: string | null;
}): TeacherClassroomAttendanceSessionDto {
  return {
    id: session.id,
    status:
      session.status === AttendanceSessionStatus.SUBMITTED
        ? 'submitted'
        : 'draft',
    submittedAt: session.submittedAt,
  };
}

function presentPagination(
  pagination: TeacherClassroomAttendancePaginationDto,
): TeacherClassroomAttendancePaginationDto {
  return pagination;
}

function filterRoster(
  roster: RollCallRosterResponseDto,
  search?: string,
): RollCallRosterResponseDto['items'] {
  const normalized = search?.trim().toLowerCase();
  if (!normalized) return roster.items;

  return roster.items.filter((student) =>
    student.name.toLowerCase().includes(normalized),
  );
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_ROSTER_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_ROSTER_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}

function normalizeDateOnly(date: string): string {
  return date.slice(0, 10);
}

function toTeacherAttendanceStatus(
  status: AttendanceStatus | null | undefined,
): TeacherClassroomAttendanceStatus | null {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return 'present';
    case AttendanceStatus.ABSENT:
      return 'absent';
    case AttendanceStatus.LATE:
      return 'late';
    case AttendanceStatus.EXCUSED:
      return 'excused';
    case AttendanceStatus.EARLY_LEAVE:
    case AttendanceStatus.UNMARKED:
    case null:
    case undefined:
      return null;
  }
}
