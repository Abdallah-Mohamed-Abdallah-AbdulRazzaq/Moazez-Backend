import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  XpSourceType,
} from '@prisma/client';
import {
  assertValidHeroDashboardDateRange,
  buildHeroTopStudents,
  calculateAverageProgressPercent,
  calculateHeroCompletionRate,
  deriveHeroMissionRewardState,
  summarizeBadgeEarnings,
  summarizeHeroEventTypes,
  summarizeHeroMissionStatuses,
  summarizeHeroProgressStatuses,
  summarizeHeroRewards,
} from '../domain/hero-journey-dashboard-domain';

describe('Hero Journey dashboard domain helpers', () => {
  it('returns zero completion rate for zero progress', () => {
    expect(calculateHeroCompletionRate(0, 0)).toBe(0);
  });

  it('rounds completion rate consistently', () => {
    expect(calculateHeroCompletionRate(1, 3)).toBe(0.3333);
  });

  it('maps mission status counts correctly', () => {
    expect(
      summarizeHeroMissionStatuses([
        {
          status: HeroMissionStatus.DRAFT,
          rewardXp: 0,
          badgeRewardId: null,
        },
        {
          status: HeroMissionStatus.PUBLISHED,
          rewardXp: 10,
          badgeRewardId: 'badge-1',
        },
        {
          status: 'archived',
          rewardXp: 5,
          badgeRewardId: null,
        },
      ]),
    ).toEqual({
      total: 3,
      draft: 1,
      published: 1,
      archived: 1,
      withBadgeReward: 1,
      withXpReward: 2,
    });
  });

  it('maps progress status counts correctly', () => {
    expect(
      summarizeHeroProgressStatuses(
        [
          { status: HeroMissionProgressStatus.IN_PROGRESS },
          { status: HeroMissionProgressStatus.COMPLETED },
          { status: HeroMissionProgressStatus.CANCELLED },
        ],
        5,
      ),
    ).toEqual({
      totalProgress: 5,
      notStarted: 2,
      inProgress: 1,
      completed: 1,
      cancelled: 1,
      completionRate: 0.2,
    });
  });

  it('maps event type counts correctly', () => {
    expect(
      summarizeHeroEventTypes([
        { type: HeroJourneyEventType.MISSION_STARTED },
        { type: HeroJourneyEventType.OBJECTIVE_COMPLETED },
        { type: HeroJourneyEventType.MISSION_COMPLETED },
        { type: HeroJourneyEventType.XP_GRANTED },
        { type: 'badge_awarded' },
      ]),
    ).toEqual({
      missionStarted: 1,
      objectiveCompleted: 1,
      missionCompleted: 1,
      xpGranted: 1,
      badgeAwarded: 1,
    });
  });

  it('uses only HERO_MISSION ledger rows for Hero XP summary', () => {
    expect(
      summarizeHeroRewards({
        xpLedger: [
          {
            sourceType: XpSourceType.HERO_MISSION,
            sourceId: 'progress-1',
            amount: 10,
          },
          {
            sourceType: XpSourceType.MANUAL_BONUS,
            sourceId: 'manual-1',
            amount: 999,
          },
        ],
        studentBadges: [{ studentId: 'student-1' }],
      }),
    ).toEqual({
      totalHeroXp: 10,
      xpGrantedMissions: 1,
      badgesAwarded: 1,
      studentsWithBadges: 1,
    });
  });

  it('uses HeroStudentBadge rows only for badge earning summary', () => {
    expect(
      summarizeBadgeEarnings({
        badges: [
          { id: 'badge-1', isActive: true },
          { id: 'badge-2', isActive: false },
        ],
        studentBadges: [
          { badgeId: 'badge-1', studentId: 'student-1' },
          { badgeId: 'badge-1', studentId: 'student-2' },
        ],
      }),
    ).toEqual({
      badgesTotal: 2,
      activeBadges: 1,
      earnedTotal: 2,
      studentsWithBadges: 2,
    });
  });

  it('sorts top students by XP, completed missions, badges, then stable name', () => {
    const rows = buildHeroTopStudents({
      progress: [
        {
          studentId: 'student-b',
          student: student('student-b', 'Beta'),
          progressStatus: HeroMissionProgressStatus.COMPLETED,
          progressPercent: 100,
        },
        {
          studentId: 'student-a',
          student: student('student-a', 'Alpha'),
          progressStatus: HeroMissionProgressStatus.COMPLETED,
          progressPercent: 80,
        },
      ],
      xpLedger: [
        { studentId: 'student-a', student: student('student-a', 'Alpha'), xpAmount: 20 },
        { studentId: 'student-b', student: student('student-b', 'Beta'), xpAmount: 20 },
        { studentId: 'student-c', student: student('student-c', 'Charlie'), xpAmount: 5 },
      ],
      badges: [
        { studentId: 'student-a', student: student('student-a', 'Alpha'), badgeId: 'badge-1' },
        { studentId: 'student-b', student: student('student-b', 'Beta'), badgeId: 'badge-1' },
        { studentId: 'student-b', student: student('student-b', 'Beta'), badgeId: 'badge-2' },
      ],
    });

    expect(rows.map((row) => row.studentId)).toEqual([
      'student-b',
      'student-a',
      'student-c',
    ]);
  });

  it('does not infer XP or badge state from configured rewards alone', () => {
    expect(
      deriveHeroMissionRewardState({
        mission: {
          id: 'mission-1',
          rewardXp: 50,
          badgeRewardId: 'badge-1',
        },
      }),
    ).toMatchObject({
      xpGranted: false,
      xpLedgerId: null,
      badgeAwarded: false,
      studentBadgeId: null,
    });
  });

  it('calculates average progress percent and rejects invalid date ranges', () => {
    expect(
      calculateAverageProgressPercent([
        { progressPercent: 100 },
        { progressPercent: 50 },
      ]),
    ).toBe(75);
    expect(() =>
      assertValidHeroDashboardDateRange({
        dateFrom: new Date('2026-04-02T00:00:00.000Z'),
        dateTo: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ).toThrow('Hero Journey dashboard date range start');
  });

  function student(id: string, firstName: string) {
    return {
      id,
      firstName,
      lastName: 'Hero',
      nameAr: null,
      code: null,
      admissionNo: null,
    };
  }
});
