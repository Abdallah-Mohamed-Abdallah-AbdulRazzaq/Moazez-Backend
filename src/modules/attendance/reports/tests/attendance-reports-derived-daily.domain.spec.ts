import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  DailyComputationStrategy,
} from '@prisma/client';
import {
  buildDerivedDailyAbsenceRows,
  DerivedDailyAbsenceEvidence,
} from '../domain/derived-daily-attendance';

describe('derived daily attendance domain helper', () => {
  it('computes no rows for non-derivable policy configuration', () => {
    expect(
      buildDerivedDailyAbsenceRows([
        evidence({
          policy: {
            dailyComputationStrategy: DailyComputationStrategy.MANUAL,
            selectedPeriodIds: ['period-1'],
            absentIfMissedPeriodsCount: 1,
          },
        }),
      ]),
    ).toEqual([]);

    expect(
      buildDerivedDailyAbsenceRows([
        evidence({
          policy: {
            dailyComputationStrategy:
              DailyComputationStrategy.DERIVED_FROM_PERIODS,
            selectedPeriodIds: [],
            absentIfMissedPeriodsCount: 1,
          },
        }),
      ]),
    ).toEqual([]);

    expect(
      buildDerivedDailyAbsenceRows([
        evidence({
          policy: {
            dailyComputationStrategy:
              DailyComputationStrategy.DERIVED_FROM_PERIODS,
            selectedPeriodIds: ['period-1'],
            absentIfMissedPeriodsCount: null,
          },
        }),
      ]),
    ).toEqual([]);
  });

  it('ignores evidence outside submitted selected PERIOD sessions', () => {
    const rows = buildDerivedDailyAbsenceRows([
      evidence({ sessionStatus: AttendanceSessionStatus.DRAFT }),
      evidence({ mode: AttendanceMode.DAILY, periodKey: 'daily' }),
      evidence({ periodId: null }),
      evidence({ policyId: null }),
      evidence({ periodId: 'period-outside' }),
    ]);

    expect(rows).toEqual([]);
  });

  it('counts only ABSENT as missed and emits no derived PRESENT rows', () => {
    const rows = buildDerivedDailyAbsenceRows([
      evidence({ periodId: 'period-1', status: AttendanceStatus.ABSENT }),
      evidence({ periodId: 'period-2', status: AttendanceStatus.PRESENT }),
      evidence({ periodId: 'period-3', status: AttendanceStatus.LATE }),
      evidence({ periodId: 'period-4', status: AttendanceStatus.EARLY_LEAVE }),
      evidence({ periodId: 'period-5', status: AttendanceStatus.EXCUSED }),
      evidence({ periodId: 'period-6', status: AttendanceStatus.UNMARKED }),
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        derivedStatus: AttendanceStatus.ABSENT,
        missedPeriodCount: 1,
        requiredMissedPeriodsCount: 1,
        missedPeriodIds: ['period-1'],
        evidencePeriodCount: 6,
        sourcePeriodIds: [
          'period-1',
          'period-2',
          'period-3',
          'period-4',
          'period-5',
          'period-6',
        ],
        reportOnly: true,
      }),
    ]);
  });

  it('emits no row when missed period count is below threshold', () => {
    const rows = buildDerivedDailyAbsenceRows([
      evidence({
        periodId: 'period-1',
        status: AttendanceStatus.ABSENT,
        policy: {
          dailyComputationStrategy:
            DailyComputationStrategy.DERIVED_FROM_PERIODS,
          selectedPeriodIds: ['period-1', 'period-2'],
          absentIfMissedPeriodsCount: 2,
        },
      }),
      evidence({
        periodId: 'period-2',
        status: AttendanceStatus.PRESENT,
        policy: {
          dailyComputationStrategy:
            DailyComputationStrategy.DERIVED_FROM_PERIODS,
          selectedPeriodIds: ['period-1', 'period-2'],
          absentIfMissedPeriodsCount: 2,
        },
      }),
    ]);

    expect(rows).toEqual([]);
  });

  it('counts each selected period once and keeps the most recently updated duplicate evidence', () => {
    const olderAbsent = evidence({
      entryId: 'entry-a',
      periodId: 'period-1',
      status: AttendanceStatus.ABSENT,
      entryUpdatedAt: new Date('2026-09-15T08:00:00.000Z'),
    });
    const newerPresent = evidence({
      entryId: 'entry-b',
      periodId: 'period-1',
      status: AttendanceStatus.PRESENT,
      entryUpdatedAt: new Date('2026-09-15T09:00:00.000Z'),
    });
    const secondMiss = evidence({
      entryId: 'entry-c',
      periodId: 'period-2',
      status: AttendanceStatus.ABSENT,
      entryUpdatedAt: new Date('2026-09-15T09:10:00.000Z'),
    });

    expect(
      buildDerivedDailyAbsenceRows([olderAbsent, newerPresent, secondMiss]),
    ).toEqual([
      expect.objectContaining({
        missedPeriodCount: 1,
        missedPeriodIds: ['period-2'],
        evidencePeriodCount: 2,
        sourcePeriodIds: ['period-1', 'period-2'],
      }),
    ]);
  });
});

function evidence(
  overrides: Partial<DerivedDailyAbsenceEvidence> & {
    policy?: Partial<NonNullable<DerivedDailyAbsenceEvidence['policy']>> | null;
  } = {},
): DerivedDailyAbsenceEvidence {
  const policy =
    overrides.policy === null
      ? null
      : {
          id: 'policy-1',
          dailyComputationStrategy:
            DailyComputationStrategy.DERIVED_FROM_PERIODS,
          selectedPeriodIds: [
            'period-1',
            'period-2',
            'period-3',
            'period-4',
            'period-5',
            'period-6',
          ],
          absentIfMissedPeriodsCount: 1,
          updatedAt: new Date('2026-09-15T07:00:00.000Z'),
          ...(overrides.policy ?? {}),
        };

  return {
    entryId: overrides.entryId ?? 'entry-1',
    studentId: overrides.studentId ?? 'student-1',
    enrollmentId: overrides.enrollmentId ?? 'enrollment-1',
    status: overrides.status ?? AttendanceStatus.ABSENT,
    entryUpdatedAt:
      overrides.entryUpdatedAt ?? new Date('2026-09-15T08:00:00.000Z'),
    sessionId: overrides.sessionId ?? 'session-1',
    date: overrides.date ?? '2026-09-15',
    scopeType: overrides.scopeType ?? AttendanceScopeType.CLASSROOM,
    scopeKey: overrides.scopeKey ?? 'classroom:classroom-1',
    stageId: overrides.stageId ?? 'stage-1',
    gradeId: overrides.gradeId ?? 'grade-1',
    sectionId: overrides.sectionId ?? 'section-1',
    classroomId: overrides.classroomId ?? 'classroom-1',
    mode: overrides.mode ?? AttendanceMode.PERIOD,
    periodId:
      Object.prototype.hasOwnProperty.call(overrides, 'periodId')
        ? (overrides.periodId ?? null)
        : 'period-1',
    periodKey: overrides.periodKey ?? 'period-key-1',
    policyId:
      Object.prototype.hasOwnProperty.call(overrides, 'policyId')
        ? (overrides.policyId ?? null)
        : policy?.id ?? null,
    sessionStatus:
      overrides.sessionStatus ?? AttendanceSessionStatus.SUBMITTED,
    sessionSubmittedAt:
      overrides.sessionSubmittedAt ??
      new Date('2026-09-15T09:30:00.000Z'),
    sessionUpdatedAt:
      overrides.sessionUpdatedAt ?? new Date('2026-09-15T09:30:00.000Z'),
    policy,
  };
}
