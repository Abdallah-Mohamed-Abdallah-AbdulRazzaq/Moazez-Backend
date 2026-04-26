import { AttendanceMode, AttendanceSessionStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AttendanceSessionAlreadySubmittedException } from '../domain/roll-call.exceptions';
import {
  assertDraftAttendanceSession,
  normalizeAttendancePeriodKey,
} from '../domain/session-key';

describe('roll-call session key helpers', () => {
  it('normalizes DAILY period key to daily', () => {
    expect(
      normalizeAttendancePeriodKey({
        mode: AttendanceMode.DAILY,
        periodKey: 'anything',
      }),
    ).toBe('daily');
  });

  it('requires non-empty periodKey for PERIOD sessions', () => {
    expect(() =>
      normalizeAttendancePeriodKey({
        mode: AttendanceMode.PERIOD,
        periodKey: '   ',
      }),
    ).toThrow(ValidationDomainException);
  });

  it('rejects mutations outside DRAFT status', () => {
    expect(() =>
      assertDraftAttendanceSession({
        sessionId: 'session-1',
        status: AttendanceSessionStatus.SUBMITTED,
      }),
    ).toThrow(AttendanceSessionAlreadySubmittedException);
  });
});
