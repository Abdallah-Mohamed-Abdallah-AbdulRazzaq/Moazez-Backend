import {
  AttendanceExcuseRequestResponseDto,
  AttendanceExcuseRequestsListResponseDto,
  AttendanceExcuseStudentResponseDto,
} from '../dto/attendance-excuse.dto';
import { AttendanceExcuseRequestRecord } from '../infrastructure/attendance-excuses.repository';

type StudentShape = {
  id: string;
  firstName: string;
  lastName: string;
};

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function fullName(student: StudentShape): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function presentStudent(
  student: StudentShape | null,
): AttendanceExcuseStudentResponseDto | null {
  if (!student) return null;

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

export function presentAttendanceExcuseRequest(
  request: AttendanceExcuseRequestRecord,
): AttendanceExcuseRequestResponseDto {
  const student = presentStudent(request.student);
  const selectedPeriodKeys = [...request.selectedPeriodKeys];

  return {
    id: request.id,
    academicYearId: request.academicYearId,
    yearId: request.academicYearId,
    termId: request.termId,
    studentId: request.studentId,
    student,
    studentName: student?.name ?? null,
    studentNameAr: null,
    studentNameEn: student?.fullNameEn ?? null,
    studentNumber: student?.studentNumber ?? null,
    type: request.type,
    status: request.status,
    dateFrom: formatDateOnly(request.dateFrom),
    dateTo: formatDateOnly(request.dateTo),
    selectedPeriodKeys,
    selectedPeriodIds: selectedPeriodKeys,
    lateMinutes: request.lateMinutes,
    minutesLate: request.lateMinutes,
    earlyLeaveMinutes: request.earlyLeaveMinutes,
    minutesEarlyLeave: request.earlyLeaveMinutes,
    reasonAr: request.reasonAr,
    reasonEn: request.reasonEn,
    decisionNote: request.decisionNote,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdById: request.createdById,
    decidedById: request.decidedById,
    linkedSessionIds: request.linkedSessions.map(
      (linkedSession) => linkedSession.attendanceSessionId,
    ),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function presentAttendanceExcuseRequests(
  requests: AttendanceExcuseRequestRecord[],
): AttendanceExcuseRequestsListResponseDto {
  return {
    items: requests.map((request) => presentAttendanceExcuseRequest(request)),
  };
}
