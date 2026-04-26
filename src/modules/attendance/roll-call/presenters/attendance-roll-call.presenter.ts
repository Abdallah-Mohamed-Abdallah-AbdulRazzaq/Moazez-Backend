import {
  AttendanceRollCallEntryResponseDto,
  AttendanceRollCallPlacementResponseDto,
  AttendanceRollCallRosterRowResponseDto,
  AttendanceRollCallSessionSummaryResponseDto,
  AttendanceRollCallStudentResponseDto,
  RollCallRosterResponseDto,
  RollCallSessionResponseDto,
  RollCallSessionsListResponseDto,
  SaveRollCallEntriesResponseDto,
} from '../dto/attendance-roll-call.dto';
import {
  RollCallAttendanceEntryRecord,
  RollCallRosterEnrollmentRecord,
  RollCallSessionDetailRecord,
  RollCallSessionSummaryRecord,
} from '../infrastructure/attendance-roll-call.repository';

type StudentShape = {
  id: string;
  firstName: string;
  lastName: string;
};

type PlacementShape = {
  classroom: AttendanceRollCallPlacementResponseDto | null;
  section: AttendanceRollCallPlacementResponseDto | null;
  grade: AttendanceRollCallPlacementResponseDto | null;
  stage: AttendanceRollCallPlacementResponseDto | null;
};

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function fullName(student: StudentShape): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function presentPlacementNode(node: {
  id: string;
  nameAr: string;
  nameEn: string;
}): AttendanceRollCallPlacementResponseDto {
  return {
    id: node.id,
    name: deriveName(node.nameAr, node.nameEn),
    nameAr: node.nameAr,
    nameEn: node.nameEn,
  };
}

function presentRosterPlacement(
  enrollment: RollCallRosterEnrollmentRecord,
): PlacementShape {
  const section = enrollment.classroom.section;
  const grade = section.grade;
  const stage = grade.stage;

  return {
    classroom: presentPlacementNode(enrollment.classroom),
    section: presentPlacementNode(section),
    grade: presentPlacementNode(grade),
    stage: presentPlacementNode(stage),
  };
}

function presentEntryPlacement(
  entry: RollCallAttendanceEntryRecord,
): PlacementShape {
  const classroom = entry.enrollment?.classroom;
  const section = classroom?.section;
  const grade = section?.grade;
  const stage = grade?.stage;

  return {
    classroom: classroom ? presentPlacementNode(classroom) : null,
    section: section ? presentPlacementNode(section) : null,
    grade: grade ? presentPlacementNode(grade) : null,
    stage: stage ? presentPlacementNode(stage) : null,
  };
}

function presentStudent(
  student: StudentShape,
  placement: PlacementShape,
): AttendanceRollCallStudentResponseDto {
  const name = fullName(student);

  return {
    id: student.id,
    studentId: student.id,
    name,
    firstName: student.firstName,
    lastName: student.lastName,
    fullNameEn: name,
    studentNumber: null,
    photoUrl: null,
    classroom: placement.classroom,
    section: placement.section,
    grade: placement.grade,
    stage: placement.stage,
  };
}

export function presentRollCallSessionSummary(
  session: RollCallSessionSummaryRecord | RollCallSessionDetailRecord,
): AttendanceRollCallSessionSummaryResponseDto {
  const scopeIds =
    session.scopeKey === 'school'
      ? null
      : {
          stageId: session.stageId,
          gradeId: session.gradeId,
          sectionId: session.sectionId,
          classroomId: session.classroomId,
        };

  return {
    id: session.id,
    academicYearId: session.academicYearId,
    yearId: session.academicYearId,
    termId: session.termId,
    date: formatDateOnly(session.date),
    scopeType: session.scopeType,
    scopeKey: session.scopeKey,
    scopeIds,
    mode: session.mode,
    periodId: session.periodId,
    periodKey: session.periodKey,
    periodLabelAr: session.periodLabelAr,
    periodLabelEn: session.periodLabelEn,
    policyId: session.policyId,
    status: session.status,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    submittedById: session.submittedById,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function presentRollCallEntry(
  entry: RollCallAttendanceEntryRecord,
): AttendanceRollCallEntryResponseDto {
  const student = entry.student
    ? presentStudent(entry.student, presentEntryPlacement(entry))
    : null;

  return {
    id: entry.id,
    sessionId: entry.sessionId,
    studentId: entry.studentId,
    enrollmentId: entry.enrollmentId,
    status: entry.status,
    lateMinutes: entry.lateMinutes,
    minutesLate: entry.lateMinutes,
    earlyLeaveMinutes: entry.earlyLeaveMinutes,
    minutesEarlyLeave: entry.earlyLeaveMinutes,
    excuseReason: entry.excuseReason,
    note: entry.note,
    markedById: entry.markedById,
    markedAt: entry.markedAt?.toISOString() ?? null,
    student,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function presentRollCallSession(
  session: RollCallSessionDetailRecord,
): RollCallSessionResponseDto {
  return {
    session: presentRollCallSessionSummary(session),
    entries: session.entries.map((entry) => presentRollCallEntry(entry)),
  };
}

export function presentRollCallSessions(
  sessions: RollCallSessionSummaryRecord[],
): RollCallSessionsListResponseDto {
  return {
    items: sessions.map((session) => presentRollCallSessionSummary(session)),
  };
}

export function presentRollCallRoster(params: {
  roster: RollCallRosterEnrollmentRecord[];
  session: RollCallSessionDetailRecord | null;
}): RollCallRosterResponseDto {
  const entriesByStudentId = new Map(
    (params.session?.entries ?? []).map((entry) => [entry.studentId, entry]),
  );

  const items = params.roster
    .map((enrollment) => {
      const entry = entriesByStudentId.get(enrollment.studentId);
      const placement = presentRosterPlacement(enrollment);
      const student = presentStudent(enrollment.student, placement);

      return {
        ...student,
        enrollmentId: enrollment.id,
        currentStatus: entry?.status ?? null,
        entryId: entry?.id ?? null,
        lateMinutes: entry?.lateMinutes ?? null,
        earlyLeaveMinutes: entry?.earlyLeaveMinutes ?? null,
        excuseReason: entry?.excuseReason ?? null,
        note: entry?.note ?? null,
      };
    })
    .sort(compareRosterRows);

  return {
    session: params.session
      ? presentRollCallSessionSummary(params.session)
      : null,
    items,
  };
}

export function presentSavedRollCallEntries(params: {
  session: RollCallSessionDetailRecord;
  entries: RollCallAttendanceEntryRecord[];
}): SaveRollCallEntriesResponseDto {
  return {
    session: presentRollCallSessionSummary(params.session),
    entries: params.entries.map((entry) => presentRollCallEntry(entry)),
  };
}

function compareRosterRows(
  left: AttendanceRollCallRosterRowResponseDto,
  right: AttendanceRollCallRosterRowResponseDto,
): number {
  const leftKey = [
    left.stage?.nameEn ?? '',
    left.grade?.nameEn ?? '',
    left.section?.nameEn ?? '',
    left.classroom?.nameEn ?? '',
    left.lastName,
    left.firstName,
    left.id,
  ].join('|');
  const rightKey = [
    right.stage?.nameEn ?? '',
    right.grade?.nameEn ?? '',
    right.section?.nameEn ?? '',
    right.classroom?.nameEn ?? '',
    right.lastName,
    right.firstName,
    right.id,
  ].join('|');

  return leftKey.localeCompare(rightKey);
}
