import {
  ReinforcementRewardType,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  XpSourceType,
} from '@prisma/client';
import {
  assertNoPolicyConflict,
  assertPolicyCapsValid,
  assertPolicyDateRangeValid,
  assertSubmissionEligibleForXpGrant,
  assertXpCapsNotExceeded,
  assertXpCooldownNotViolated,
  buildEffectiveScopeCandidates,
  calculateXpCapUsage,
  resolveXpAmountFromReinforcementSubmission,
  selectEffectiveXpPolicy,
  summarizeXpLedger,
} from '../domain/reinforcement-xp-domain';

describe('reinforcement XP domain helpers', () => {
  it('rejects invalid caps and date ranges', () => {
    expect(() =>
      assertPolicyCapsValid({ dailyCap: 50, weeklyCap: 40 }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));

    expect(() =>
      assertPolicyDateRangeValid({
        startsAt: new Date('2026-04-30T00:00:00.000Z'),
        endsAt: new Date('2026-04-29T00:00:00.000Z'),
      }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('rejects active policy conflicts', () => {
    expect(() => assertNoPolicyConflict({ id: 'policy-1' })).toThrow(
      expect.objectContaining({ code: 'reinforcement.policy.conflict' }),
    );
  });

  it('chooses the most specific effective policy', () => {
    const now = new Date('2026-04-29T12:00:00.000Z');
    const candidates = buildEffectiveScopeCandidates(
      {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: 'student-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        studentId: 'student-1',
      },
      'school-1',
    );

    const policy = selectEffectiveXpPolicy(
      [
        policyRecord('school-policy', ReinforcementTargetScope.SCHOOL, 'school-1'),
        policyRecord(
          'classroom-policy',
          ReinforcementTargetScope.CLASSROOM,
          'classroom-1',
        ),
        policyRecord(
          'student-policy',
          ReinforcementTargetScope.STUDENT,
          'student-1',
        ),
      ],
      candidates,
      now,
    );

    expect(policy?.id).toBe('student-policy');
  });

  it('returns null when no effective policy exists', () => {
    const policy = selectEffectiveXpPolicy(
      [
        {
          ...policyRecord(
            'future-policy',
            ReinforcementTargetScope.SCHOOL,
            'school-1',
          ),
          startsAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
      [{ scopeType: ReinforcementTargetScope.SCHOOL, scopeKey: 'school-1' }],
      new Date('2026-04-29T12:00:00.000Z'),
    );

    expect(policy).toBeNull();
  });

  it('resolves XP amount from task reward value', () => {
    expect(
      resolveXpAmountFromReinforcementSubmission({
        task: {
          rewardType: ReinforcementRewardType.XP,
          rewardValue: { toNumber: () => 25 },
        },
      }),
    ).toBe(25);

    expect(() =>
      resolveXpAmountFromReinforcementSubmission({
        task: { rewardType: ReinforcementRewardType.MORAL, rewardValue: null },
      }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('rejects non-approved submissions for XP grants', () => {
    expect(() =>
      assertSubmissionEligibleForXpGrant({
        id: 'submission-1',
        status: ReinforcementSubmissionStatus.SUBMITTED,
      }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('enforces daily and weekly caps', () => {
    const usage = calculateXpCapUsage({
      dailyXp: 90,
      weeklyXp: 190,
      policy: { dailyCap: 100, weeklyCap: 200 },
    });

    expect(() => assertXpCapsNotExceeded({ amount: 11, usage })).toThrow(
      expect.objectContaining({ code: 'reinforcement.xp.daily_cap_reached' }),
    );

    expect(() =>
      assertXpCapsNotExceeded({
        amount: 11,
        usage: { ...usage, dailyXp: 10 },
      }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('enforces cooldown across XP entries in the same term', () => {
    expect(() =>
      assertXpCooldownNotViolated({
        policy: { cooldownMinutes: 30 },
        latestOccurredAt: new Date('2026-04-29T10:00:00.000Z'),
        now: new Date('2026-04-29T10:15:00.000Z'),
      }),
    ).toThrow(expect.objectContaining({ code: 'reinforcement.xp.cooldown' }));
  });

  it('summarizes totals, averages, source breakdown, and top students', () => {
    const summary = summarizeXpLedger([
      ledger('student-1', 20, XpSourceType.REINFORCEMENT_TASK, 'Student', 'One'),
      ledger('student-1', 5, XpSourceType.MANUAL_BONUS, 'Student', 'One'),
      ledger('student-2', 15, XpSourceType.MANUAL_BONUS, 'Student', 'Two'),
    ]);

    expect(summary.totalXp).toBe(40);
    expect(summary.studentsCount).toBe(2);
    expect(summary.averageXp).toBe(20);
    expect(summary.bySourceType).toEqual(
      expect.arrayContaining([
        { sourceType: 'reinforcement_task', amount: 20 },
        { sourceType: 'manual_bonus', amount: 20 },
      ]),
    );
    expect(summary.topStudents[0]).toMatchObject({
      studentId: 'student-1',
      totalXp: 25,
    });
  });

  function policyRecord(
    id: string,
    scopeType: ReinforcementTargetScope,
    scopeKey: string,
  ) {
    return {
      id,
      scopeType,
      scopeKey,
      dailyCap: null,
      weeklyCap: null,
      cooldownMinutes: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      updatedAt: new Date('2026-04-29T10:00:00.000Z'),
    };
  }

  function ledger(
    studentId: string,
    amount: number,
    sourceType: XpSourceType,
    firstName: string,
    lastName: string,
  ) {
    return {
      studentId,
      amount,
      sourceType,
      student: { firstName, lastName },
    };
  }
});
