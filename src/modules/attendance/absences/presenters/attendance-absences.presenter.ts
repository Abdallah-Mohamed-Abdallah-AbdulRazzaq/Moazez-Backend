import {
  AttendanceAbsenceIncidentResponseDto,
  AttendanceAbsencePlacementResponseDto,
  AttendanceAbsencesListResponseDto,
  AttendanceAbsenceStudentResponseDto,
  AttendanceAbsenceSummaryResponseDto,
} from '../dto/attendance-absences.dto';
import { AttendanceIncidentSummary } from '../domain/attendance-incident';
import { AttendanceAbsenceIncidentRecord } from '../infrastructure/attendance-absences.repository';

type PlacementNode = {
  id: string;
  nameAr: string;
  nameEn: string;
};

type StudentShape = {
  id: string;
  firstName: string;
  lastName: string;
};

type PlacementShape = {
  classroom: AttendanceAbsencePlacementResponseDto | null;
  section: AttendanceAbsencePlacementResponseDto | null;
  grade: AttendanceAbsencePlacementResponseDto | null;
  stage: AttendanceAbsencePlacementResponseDto | null;
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

function presentPlacementNode(
  node: PlacementNode,
): AttendanceAbsencePlacementResponseDto {
  return {
    id: node.id,
    name: deriveName(node.nameAr, node.nameEn),
    nameAr: node.nameAr,
    nameEn: node.nameEn,
  };
}

function presentStudent(
  student: StudentShape,
): AttendanceAbsenceStudentResponseDto {
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
  };
}

function presentPlacement(
  incident: AttendanceAbsenceIncidentRecord,
): PlacementShape {
  const classroom =
    incident.enrollment?.classroom ?? incident.session.classroom ?? null;
  const section = classroom?.section ?? incident.session.section ?? null;
  const grade = section?.grade ?? incident.session.grade ?? null;
  const stage = grade?.stage ?? incident.session.stage ?? null;

  return {
    classroom: classroom ? presentPlacementNode(classroom) : null,
    section: section ? presentPlacementNode(section) : null,
    grade: grade ? presentPlacementNode(grade) : null,
    stage: stage ? presentPlacementNode(stage) : null,
  };
}

export function presentAttendanceAbsenceIncident(
  incident: AttendanceAbsenceIncidentRecord,
): AttendanceAbsenceIncidentResponseDto {
  const session = incident.session;
  const student = presentStudent(incident.student);
  const placement = presentPlacement(incident);
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
    id: incident.id,
    incidentId: incident.id,
    sessionId: incident.sessionId,
    sourceSessionId: incident.sessionId,
    entryId: incident.id,
    academicYearId: session.academicYearId,
    yearId: session.academicYearId,
    termId: session.termId,
    studentId: incident.studentId,
    enrollmentId: incident.enrollmentId,
    student,
    studentName: student.name,
    studentNameEn: student.fullNameEn,
    studentNumber: student.studentNumber,
    photoUrl: student.photoUrl,
    date: formatDateOnly(session.date),
    status: incident.status,
    lateMinutes: incident.lateMinutes,
    minutesLate: incident.lateMinutes,
    earlyLeaveMinutes: incident.earlyLeaveMinutes,
    minutesEarlyLeave: incident.earlyLeaveMinutes,
    excuseReason: incident.excuseReason,
    note: incident.note,
    scopeType: session.scopeType,
    scopeKey: session.scopeKey,
    scopeIds,
    stageId: session.stageId,
    gradeId: session.gradeId,
    sectionId: session.sectionId,
    classroomId: session.classroomId,
    stage: placement.stage,
    grade: placement.grade,
    section: placement.section,
    classroom: placement.classroom,
    stageNameAr: placement.stage?.nameAr ?? null,
    stageNameEn: placement.stage?.nameEn ?? null,
    gradeNameAr: placement.grade?.nameAr ?? null,
    gradeNameEn: placement.grade?.nameEn ?? null,
    sectionNameAr: placement.section?.nameAr ?? null,
    sectionNameEn: placement.section?.nameEn ?? null,
    classroomNameAr: placement.classroom?.nameAr ?? null,
    classroomNameEn: placement.classroom?.nameEn ?? null,
    mode: session.mode,
    periodId: session.periodId,
    periodKey: session.periodKey,
    periodLabelAr: session.periodLabelAr,
    periodLabelEn: session.periodLabelEn,
    periodNameAr: session.periodLabelAr,
    periodNameEn: session.periodLabelEn,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}

export function presentAttendanceAbsences(
  incidents: AttendanceAbsenceIncidentRecord[],
): AttendanceAbsencesListResponseDto {
  return {
    items: incidents.map((incident) =>
      presentAttendanceAbsenceIncident(incident),
    ),
  };
}

export function presentAttendanceAbsenceSummary(
  summary: AttendanceIncidentSummary,
): AttendanceAbsenceSummaryResponseDto {
  return {
    totalIncidents: summary.totalIncidents,
    absentCount: summary.absentCount,
    lateCount: summary.lateCount,
    earlyLeaveCount: summary.earlyLeaveCount,
    excusedCount: summary.excusedCount,
    affectedStudentsCount: summary.affectedStudentsCount,
  };
}
