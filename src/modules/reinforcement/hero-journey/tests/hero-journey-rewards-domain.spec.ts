import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  XpSourceType,
} from '@prisma/client';
import {
  assertHeroBadgeAwardable,
  assertHeroProgressRewardable,
  assertHeroXpAmountValid,
  buildHeroRewardEventPayload,
  buildHeroXpLedgerPayload,
  deriveHeroRewardState,
  resolveHeroXpAmount,
  summarizeStudentHeroRewards,
} from '../domain/hero-journey-rewards-domain';

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey rewards domain helpers', () => {
  it('requires completed progress for XP and badge rewards', () => {
    expect(() =>
      assertHeroProgressRewardable(
        progressRecord({ status: HeroMissionProgressStatus.IN_PROGRESS }),
      ),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));

    expect(() =>
      assertHeroBadgeAwardable(
        progressRecord({ status: HeroMissionProgressStatus.IN_PROGRESS }),
      ),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('uses explicit XP amount when provided and mission reward XP by default', () => {
    expect(resolveHeroXpAmount({ explicitAmount: 25, missionRewardXp: 10 })).toBe(
      25,
    );
    expect(resolveHeroXpAmount({ missionRewardXp: 10 })).toBe(10);
  });

  it('rejects when no positive XP amount is available', () => {
    expect(() =>
      assertHeroXpAmountValid(
        resolveHeroXpAmount({ explicitAmount: null, missionRewardXp: 0 }),
      ),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('allows archived missions only when progress completed before archive', () => {
    expect(() =>
      assertHeroProgressRewardable(
        progressRecord({
          completedAt: new Date('2026-04-20T10:00:00.000Z'),
          mission: missionRecord({
            status: HeroMissionStatus.ARCHIVED,
            archivedAt: new Date('2026-04-21T10:00:00.000Z'),
          }),
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertHeroProgressRewardable(
        progressRecord({
          completedAt: new Date('2026-04-22T10:00:00.000Z'),
          mission: missionRecord({
            status: HeroMissionStatus.ARCHIVED,
            archivedAt: new Date('2026-04-21T10:00:00.000Z'),
          }),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'reinforcement.hero.mission.archived' }));
  });

  it('rejects badge awards when no badge is configured or the badge is inactive/deleted', () => {
    expect(() =>
      assertHeroBadgeAwardable(
        progressRecord({
          mission: missionRecord({ badgeRewardId: null, badgeReward: null }),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));

    expect(() =>
      assertHeroBadgeAwardable(
        progressRecord({
          mission: missionRecord({
            badgeReward: badgeRecord({ isActive: false }),
          }),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));

    expect(() =>
      assertHeroBadgeAwardable(
        progressRecord({
          mission: missionRecord({
            badgeReward: badgeRecord({ deletedAt: NOW }),
          }),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('builds HERO_MISSION XP ledger and reward event payloads', () => {
    const progress = progressRecord();
    const ledger = buildHeroXpLedgerPayload({
      schoolId: 'school-1',
      progress,
      policyId: 'policy-1',
      amount: 15,
      reason: 'quest_completed',
      actorUserId: 'actor-1',
      occurredAt: NOW,
    });
    expect(ledger).toMatchObject({
      sourceType: XpSourceType.HERO_MISSION,
      sourceId: progress.id,
      studentId: progress.studentId,
      enrollmentId: progress.enrollmentId,
      assignmentId: null,
      policyId: 'policy-1',
      amount: 15,
    });

    expect(
      buildHeroRewardEventPayload({
        schoolId: 'school-1',
        type: HeroJourneyEventType.XP_GRANTED,
        progress,
        xpLedgerId: 'ledger-1',
        actorUserId: 'actor-1',
        occurredAt: NOW,
      }),
    ).toMatchObject({
      type: HeroJourneyEventType.XP_GRANTED,
      missionId: progress.missionId,
      missionProgressId: progress.id,
      xpLedgerId: 'ledger-1',
    });
  });

  it('derives reward state and summarizes student rewards', () => {
    const state = deriveHeroRewardState({
      progress: progressRecord(),
      ledger: {
        id: 'ledger-1',
        sourceType: XpSourceType.HERO_MISSION,
        sourceId: 'progress-1',
        amount: 10,
      },
      studentBadge: {
        id: 'student-badge-1',
        badgeId: 'badge-1',
      },
    });
    expect(state).toMatchObject({
      xpGranted: true,
      xpLedgerId: 'ledger-1',
      badgeAwarded: true,
      studentBadgeId: 'student-badge-1',
    });

    expect(
      summarizeStudentHeroRewards({
        totalHeroXp: 30,
        badgesCount: 1,
        missionRewardStates: [state, { ...state, xpGranted: false }],
      }),
    ).toEqual({
      totalHeroXp: 30,
      badgesCount: 1,
      completedMissions: 2,
      xpGrantedMissions: 1,
      badgeAwardedMissions: 2,
    });
  });

  function progressRecord(overrides?: any) {
    return {
      id: 'progress-1',
      missionId: 'mission-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: overrides?.status ?? HeroMissionProgressStatus.COMPLETED,
      completedAt: overrides?.completedAt ?? NOW,
      mission: overrides?.mission ?? missionRecord(),
    };
  }

  function missionRecord(overrides?: any) {
    return {
      id: 'mission-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      rewardXp: overrides?.rewardXp ?? 10,
      badgeRewardId:
        overrides?.badgeRewardId === undefined ? 'badge-1' : overrides.badgeRewardId,
      status: overrides?.status ?? HeroMissionStatus.PUBLISHED,
      archivedAt: overrides?.archivedAt ?? null,
      deletedAt: overrides?.deletedAt ?? null,
      badgeReward:
        overrides?.badgeReward === undefined
          ? badgeRecord()
          : overrides.badgeReward,
    };
  }

  function badgeRecord(overrides?: any) {
    return {
      id: 'badge-1',
      isActive: overrides?.isActive ?? true,
      deletedAt: overrides?.deletedAt ?? null,
    };
  }
});
