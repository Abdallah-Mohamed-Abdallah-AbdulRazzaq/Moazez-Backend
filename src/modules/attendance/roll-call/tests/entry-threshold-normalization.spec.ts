import { AttendanceStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  AttendanceEntryThresholdPolicy,
  normalizeDraftEntriesByPolicyThresholds,
} from '../domain/entry-threshold-normalization';

describe('normalizeDraftEntriesByPolicyThresholds', () => {
  const policy: AttendanceEntryThresholdPolicy = {
    id: 'policy-1',
    lateThresholdMinutes: 10,
    earlyLeaveThresholdMinutes: 12,
  };

  it('converts PRESENT entries to LATE when explicit late minutes meet the policy threshold', () => {
    const [entry] = normalizeDraftEntriesByPolicyThresholds(
      [
        entryFixture({
          status: AttendanceStatus.PRESENT,
          lateMinutes: 10,
          earlyLeaveMinutes: 4,
        }),
      ],
      policy,
    );

    expect(entry).toMatchObject({
      status: AttendanceStatus.LATE,
      lateMinutes: 10,
      earlyLeaveMinutes: null,
    });
  });

  it('converts PRESENT entries to EARLY_LEAVE when explicit early-leave minutes meet the policy threshold', () => {
    const [entry] = normalizeDraftEntriesByPolicyThresholds(
      [
        entryFixture({
          status: AttendanceStatus.PRESENT,
          lateMinutes: 4,
          earlyLeaveMinutes: 12,
        }),
      ],
      policy,
    );

    expect(entry).toMatchObject({
      status: AttendanceStatus.EARLY_LEAVE,
      lateMinutes: null,
      earlyLeaveMinutes: 12,
    });
  });

  it('leaves PRESENT entries unchanged when minute values are below or zero against configured thresholds', () => {
    const entries = [
      entryFixture({ lateMinutes: 9 }),
      entryFixture({ earlyLeaveMinutes: 11 }),
      entryFixture({ lateMinutes: 0, earlyLeaveMinutes: 0 }),
    ];

    expect(normalizeDraftEntriesByPolicyThresholds(entries, policy)).toEqual(
      entries,
    );
  });

  it('leaves entries unchanged when thresholds are absent or the session has no linked policy', () => {
    const entries = [entryFixture({ lateMinutes: 20 })];

    expect(normalizeDraftEntriesByPolicyThresholds(entries, null)).toBe(
      entries,
    );
    expect(
      normalizeDraftEntriesByPolicyThresholds(entries, {
        id: 'policy-1',
        lateThresholdMinutes: null,
        earlyLeaveThresholdMinutes: null,
      }),
    ).toBe(entries);
  });

  it('does not normalize explicit non-PRESENT statuses', () => {
    const entries = [
      entryFixture({ status: AttendanceStatus.LATE, lateMinutes: null }),
      entryFixture({
        status: AttendanceStatus.EARLY_LEAVE,
        earlyLeaveMinutes: null,
      }),
      entryFixture({ status: AttendanceStatus.ABSENT, lateMinutes: 20 }),
      entryFixture({ status: AttendanceStatus.EXCUSED, earlyLeaveMinutes: 20 }),
    ];

    expect(normalizeDraftEntriesByPolicyThresholds(entries, policy)).toEqual(
      entries,
    );
  });

  it('rejects ambiguous PRESENT entries without leaking tenant internals', () => {
    expect(() =>
      normalizeDraftEntriesByPolicyThresholds(
        [entryFixture({ lateMinutes: 10, earlyLeaveMinutes: 12 })],
        policy,
      ),
    ).toThrow(ValidationDomainException);

    try {
      normalizeDraftEntriesByPolicyThresholds(
        [entryFixture({ lateMinutes: 10, earlyLeaveMinutes: 12 })],
        policy,
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: 'validation.failed',
        message:
          'Attendance entry cannot match both late and early-leave thresholds',
        details: {
          field: 'status',
          studentId: 'student-1',
          lateMinutes: 10,
          earlyLeaveMinutes: 12,
          lateThresholdMinutes: 10,
          earlyLeaveThresholdMinutes: 12,
          reason: 'ambiguous_threshold_match',
        },
      });
      const details = (error as ValidationDomainException).details ?? {};
      expect(details).not.toHaveProperty('schoolId');
      expect(details).not.toHaveProperty('organizationId');
      expect(details).not.toHaveProperty('membershipId');
      expect(details).not.toHaveProperty('roleId');
      expect(details).not.toHaveProperty('deletedAt');
      expect(details).not.toHaveProperty('actorId');
    }
  });
});

function entryFixture(
  overrides?: Partial<{
    studentId: string;
    status: AttendanceStatus;
    lateMinutes: number | null;
    earlyLeaveMinutes: number | null;
  }>,
) {
  return {
    studentId: overrides?.studentId ?? 'student-1',
    enrollmentId: 'enrollment-1',
    status: overrides?.status ?? AttendanceStatus.PRESENT,
    lateMinutes: overrides?.lateMinutes ?? null,
    earlyLeaveMinutes: overrides?.earlyLeaveMinutes ?? null,
    excuseReason: null,
    note: null,
  };
}
