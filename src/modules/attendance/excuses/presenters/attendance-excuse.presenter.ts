import {
  AttendanceExcuseAttachmentResponseDto,
  AttendanceExcuseAttachmentsListResponseDto,
  AttendanceExcuseRequestResponseDto,
  AttendanceExcuseRequestsListResponseDto,
  AttendanceExcuseStudentResponseDto,
} from '../dto/attendance-excuse.dto';
import {
  AttendanceExcuseAttachmentRecord,
  AttendanceExcuseRequestRecord,
} from '../infrastructure/attendance-excuses.repository';

const FILE_DOWNLOAD_ROUTE_PREFIX = '/api/v1/files';

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
  options?: {
    attachmentCount?: number;
    attachments?: AttendanceExcuseAttachmentRecord[];
  },
): AttendanceExcuseRequestResponseDto {
  const student = presentStudent(request.student);
  const selectedPeriodKeys = [...request.selectedPeriodKeys];
  const presentedAttachments = options?.attachments?.map((attachment) =>
    presentAttendanceExcuseAttachment(attachment),
  );

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
    attachmentCount:
      options?.attachmentCount ?? presentedAttachments?.length ?? 0,
    ...(presentedAttachments ? { attachments: presentedAttachments } : {}),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function presentAttendanceExcuseRequests(
  requests: AttendanceExcuseRequestRecord[],
  attachmentCounts?: Map<string, number>,
): AttendanceExcuseRequestsListResponseDto {
  return {
    items: requests.map((request) =>
      presentAttendanceExcuseRequest(request, {
        attachmentCount: attachmentCounts?.get(request.id) ?? 0,
      }),
    ),
  };
}

export function presentAttendanceExcuseAttachment(
  attachment: AttendanceExcuseAttachmentRecord,
): AttendanceExcuseAttachmentResponseDto {
  const originalName = attachment.file.originalName;

  return {
    id: attachment.id,
    fileId: attachment.fileId,
    filename: originalName,
    originalName,
    mimeType: attachment.file.mimeType,
    sizeBytes: attachment.file.sizeBytes.toString(),
    createdAt: attachment.createdAt.toISOString(),
    downloadUrl: `${FILE_DOWNLOAD_ROUTE_PREFIX}/${attachment.fileId}/download`,
  };
}

export function presentAttendanceExcuseAttachments(
  attachments: AttendanceExcuseAttachmentRecord[],
): AttendanceExcuseAttachmentsListResponseDto {
  return {
    items: attachments.map((attachment) =>
      presentAttendanceExcuseAttachment(attachment),
    ),
  };
}
