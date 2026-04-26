import { AttendanceStatus } from '@prisma/client';

export const ATTENDANCE_INCIDENT_STATUSES = [
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EARLY_LEAVE,
  AttendanceStatus.EXCUSED,
] as const;

export type AttendanceIncidentStatus =
  (typeof ATTENDANCE_INCIDENT_STATUSES)[number];

export interface AttendanceIncidentSummaryInput {
  status: AttendanceStatus;
  studentId: string;
}

export interface AttendanceIncidentSummary {
  totalIncidents: number;
  absentCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  excusedCount: number;
  affectedStudentsCount: number;
}

export function isAttendanceIncidentStatus(
  status: AttendanceStatus,
): status is AttendanceIncidentStatus {
  return ATTENDANCE_INCIDENT_STATUSES.includes(
    status as AttendanceIncidentStatus,
  );
}

export function resolveAttendanceIncidentStatuses(
  status?: AttendanceStatus,
): AttendanceIncidentStatus[] {
  if (!status) return [...ATTENDANCE_INCIDENT_STATUSES];
  return isAttendanceIncidentStatus(status) ? [status] : [];
}

export function summarizeAttendanceIncidents(
  incidents: AttendanceIncidentSummaryInput[],
): AttendanceIncidentSummary {
  const affectedStudentIds = new Set<string>();
  const summary: AttendanceIncidentSummary = {
    totalIncidents: 0,
    absentCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
    excusedCount: 0,
    affectedStudentsCount: 0,
  };

  for (const incident of incidents) {
    if (!isAttendanceIncidentStatus(incident.status)) continue;

    summary.totalIncidents += 1;
    affectedStudentIds.add(incident.studentId);

    if (incident.status === AttendanceStatus.ABSENT) {
      summary.absentCount += 1;
    } else if (incident.status === AttendanceStatus.LATE) {
      summary.lateCount += 1;
    } else if (incident.status === AttendanceStatus.EARLY_LEAVE) {
      summary.earlyLeaveCount += 1;
    } else if (incident.status === AttendanceStatus.EXCUSED) {
      summary.excusedCount += 1;
    }
  }

  summary.affectedStudentsCount = affectedStudentIds.size;
  return summary;
}
