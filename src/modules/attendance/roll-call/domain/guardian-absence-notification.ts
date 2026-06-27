export const ATTENDANCE_ABSENCE_SUBMIT_SOURCE_TYPE =
  'attendance_absence_submit';

export const ATTENDANCE_ABSENCE_NOTIFICATION_TITLE =
  'Attendance absence recorded';

export function buildGuardianAbsenceNotificationIdempotencyKey(params: {
  sessionId: string;
  entryId: string;
  studentId: string;
  recipientUserId: string;
}): string {
  return [
    'attendance.absence.submit',
    params.sessionId,
    params.entryId,
    params.studentId,
    params.recipientUserId,
    'ABSENT',
  ].join(':');
}

export function buildGuardianAbsenceNotificationBody(params: {
  studentDisplayName: string;
  date: Date;
}): string {
  return `${params.studentDisplayName} was marked absent on ${formatDateOnly(
    params.date,
  )}.`;
}

export function buildAttendanceStudentDisplayName(params: {
  firstName?: string | null;
  lastName?: string | null;
  fallback: string;
}): string {
  const displayName = [params.firstName, params.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim();

  return displayName.length > 0 ? displayName : params.fallback;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
