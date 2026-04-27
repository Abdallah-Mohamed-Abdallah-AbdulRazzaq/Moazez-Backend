import { AttendanceSessionStatus, AttendanceStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AttendanceSessionNotSubmittedException } from './roll-call.exceptions';

export interface EntryCorrectionInput {
  status: AttendanceStatus;
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
  excuseReason?: string | null;
  note?: string | null;
  correctionReason?: string | null;
}

export interface ExistingEntryCorrectionValues {
  status: AttendanceStatus;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  excuseReason: string | null;
  note: string | null;
}

export interface NormalizedEntryCorrection {
  status: AttendanceStatus;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  excuseReason: string | null;
  note: string | null;
  correctionReason: string;
}

export function assertSubmittedSessionForCorrection(params: {
  sessionId: string;
  status: AttendanceSessionStatus;
}): void {
  if (params.status !== AttendanceSessionStatus.SUBMITTED) {
    throw new AttendanceSessionNotSubmittedException({
      sessionId: params.sessionId,
      status: params.status,
    });
  }
}

export function normalizeEntryCorrection(
  input: EntryCorrectionInput,
  existing: ExistingEntryCorrectionValues,
): NormalizedEntryCorrection {
  if (input.status === AttendanceStatus.UNMARKED) {
    throw new ValidationDomainException(
      'Submitted attendance entries cannot be corrected to UNMARKED',
      { field: 'status', status: input.status },
    );
  }

  const correctionReason = normalizeRequiredString(
    input.correctionReason,
    'correctionReason',
  );
  const note = hasOwn(input, 'note')
    ? normalizeOptionalString(input.note)
    : existing.note;

  switch (input.status) {
    case AttendanceStatus.PRESENT:
      return {
        status: input.status,
        lateMinutes: null,
        earlyLeaveMinutes: null,
        excuseReason: null,
        note,
        correctionReason,
      };

    case AttendanceStatus.ABSENT:
      return {
        status: input.status,
        lateMinutes: null,
        earlyLeaveMinutes: null,
        excuseReason: null,
        note,
        correctionReason,
      };

    case AttendanceStatus.LATE:
      return {
        status: input.status,
        lateMinutes: requirePositiveMinutes(input.lateMinutes, 'lateMinutes'),
        earlyLeaveMinutes: null,
        excuseReason: null,
        note,
        correctionReason,
      };

    case AttendanceStatus.EARLY_LEAVE:
      return {
        status: input.status,
        lateMinutes: null,
        earlyLeaveMinutes: requirePositiveMinutes(
          input.earlyLeaveMinutes,
          'earlyLeaveMinutes',
        ),
        excuseReason: null,
        note,
        correctionReason,
      };

    case AttendanceStatus.EXCUSED:
      return {
        status: input.status,
        lateMinutes: hasOwn(input, 'lateMinutes')
          ? (input.lateMinutes ?? null)
          : existing.lateMinutes,
        earlyLeaveMinutes: hasOwn(input, 'earlyLeaveMinutes')
          ? (input.earlyLeaveMinutes ?? null)
          : existing.earlyLeaveMinutes,
        excuseReason:
          normalizeOptionalString(input.excuseReason) ??
          existing.excuseReason ??
          correctionReason,
        note,
        correctionReason,
      };
  }
}

export function summarizeEntryCorrectionState(entry: {
  status: AttendanceStatus;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  excuseReason: string | null;
  note: string | null;
  markedById?: string | null;
  markedAt?: Date | null;
}) {
  return {
    status: entry.status,
    lateMinutes: entry.lateMinutes,
    earlyLeaveMinutes: entry.earlyLeaveMinutes,
    excuseReason: entry.excuseReason,
    note: entry.note,
    markedById: entry.markedById ?? null,
    markedAt: entry.markedAt?.toISOString() ?? null,
  };
}

function requirePositiveMinutes(
  value: number | null | undefined,
  field: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationDomainException(
      'Attendance correction minutes must be positive',
      { field },
    );
  }

  return value;
}

function normalizeRequiredString(
  value: string | null | undefined,
  field: string,
): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new ValidationDomainException(
      'Attendance correction reason is required',
      { field },
    );
  }

  return normalized;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
