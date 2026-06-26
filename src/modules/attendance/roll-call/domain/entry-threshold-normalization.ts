import { AttendanceStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface AttendanceEntryThresholdPolicy {
  id: string;
  lateThresholdMinutes: number | null;
  earlyLeaveThresholdMinutes: number | null;
}

export interface DraftEntryThresholdNormalizationInput {
  studentId: string;
  status: AttendanceStatus;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
}

export function normalizeDraftEntriesByPolicyThresholds<
  T extends DraftEntryThresholdNormalizationInput,
>(
  entries: T[],
  policy: AttendanceEntryThresholdPolicy | null,
): T[] {
  if (
    !policy ||
    (policy.lateThresholdMinutes === null &&
      policy.earlyLeaveThresholdMinutes === null)
  ) {
    return entries;
  }

  return entries.map((entry) =>
    normalizeDraftEntryByPolicyThresholds(entry, policy),
  );
}

function normalizeDraftEntryByPolicyThresholds<
  T extends DraftEntryThresholdNormalizationInput,
>(entry: T, policy: AttendanceEntryThresholdPolicy): T {
  if (entry.status !== AttendanceStatus.PRESENT) {
    return entry;
  }

  const lateTriggered =
    policy.lateThresholdMinutes !== null &&
    entry.lateMinutes !== null &&
    entry.lateMinutes > 0 &&
    entry.lateMinutes >= policy.lateThresholdMinutes;
  const earlyLeaveTriggered =
    policy.earlyLeaveThresholdMinutes !== null &&
    entry.earlyLeaveMinutes !== null &&
    entry.earlyLeaveMinutes > 0 &&
    entry.earlyLeaveMinutes >= policy.earlyLeaveThresholdMinutes;

  if (lateTriggered && earlyLeaveTriggered) {
    throw new ValidationDomainException(
      'Attendance entry cannot match both late and early-leave thresholds',
      {
        field: 'status',
        studentId: entry.studentId,
        lateMinutes: entry.lateMinutes,
        earlyLeaveMinutes: entry.earlyLeaveMinutes,
        lateThresholdMinutes: policy.lateThresholdMinutes,
        earlyLeaveThresholdMinutes: policy.earlyLeaveThresholdMinutes,
        reason: 'ambiguous_threshold_match',
      },
    );
  }

  if (lateTriggered) {
    return {
      ...entry,
      status: AttendanceStatus.LATE,
      earlyLeaveMinutes: null,
    };
  }

  if (earlyLeaveTriggered) {
    return {
      ...entry,
      status: AttendanceStatus.EARLY_LEAVE,
      lateMinutes: null,
    };
  }

  return entry;
}
