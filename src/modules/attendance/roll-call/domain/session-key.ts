import { AttendanceMode, AttendanceSessionStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AttendanceSessionAlreadySubmittedException } from './roll-call.exceptions';

export function normalizeAttendancePeriodKey(input: {
  mode: AttendanceMode;
  periodKey?: string | null;
}): string {
  if (input.mode === AttendanceMode.DAILY) {
    return 'daily';
  }

  const periodKey = input.periodKey?.trim();
  if (!periodKey) {
    throw new ValidationDomainException(
      'Period attendance sessions require periodKey',
      { field: 'periodKey', mode: input.mode },
    );
  }

  return periodKey;
}

export function assertDraftAttendanceSession(params: {
  sessionId: string;
  status: AttendanceSessionStatus;
}): void {
  if (params.status !== AttendanceSessionStatus.DRAFT) {
    throw new AttendanceSessionAlreadySubmittedException({
      sessionId: params.sessionId,
      status: params.status,
    });
  }
}

export function parseAttendanceDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Invalid attendance date', { field });
  }

  return date;
}
