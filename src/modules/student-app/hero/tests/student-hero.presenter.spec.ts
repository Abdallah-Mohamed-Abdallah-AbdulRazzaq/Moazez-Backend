import {
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
} from '@prisma/client';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';
import type {
  StudentHeroMissionDetailReadModel,
  StudentHeroMissionsReadModel,
  StudentHeroOverviewReadModel,
} from '../infrastructure/student-hero-read.adapter';

describe('StudentHeroPresenter', () => {
  it('presents hero overview with stable unsupported rank and level fields', () => {
    const result = StudentHeroPresenter.presentOverview(overviewFixture());
    const serialized = JSON.stringify(result);

    expect(result.stats).toMatchObject({
      heroName: null,
      heroRankTitle: null,
      level: null,
      currentXp: 25,
      requiredXp: null,
      badgesCollected: 1,
      streakDays: null,
    });
    expect(result.levels).toEqual([
      expect.objectContaining({
        missionId: 'mission-1',
        status: 'completed',
        positionX: 0.1,
        positionY: 0.2,
      }),
    ]);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
    expect(serialized).not.toContain('assetPath');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('objectKey');
  });

  it('presents mission details without starting, completing, granting XP, or awarding badges', () => {
    const result = StudentHeroPresenter.presentMissionDetail(
      missionDetailFixture(),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      missionId: 'mission-1',
      status: 'completed',
      progressStatus: 'completed',
      rewards: {
        xp: 10,
        next_rank_title: null,
        badge: {
          badgeId: 'badge-1',
          slug: 'brave-reader',
          imageUrl: null,
        },
      },
      objectives: [
        expect.objectContaining({
          id: 'objective-1',
          type: 'quiz',
          isCompleted: true,
        }),
      ],
    });
    expect(serialized).not.toContain('grant');
    expect(serialized).not.toContain('award');
    expect(serialized).not.toContain('redeem');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  });

  it('uses published mission visibility and read-only progress status for mission lists', () => {
    const result = StudentHeroPresenter.presentMissions(missionsFixture());

    expect(result.visibility).toEqual({
      missionStatus: 'published',
      reason: 'published_stage_term_missions_only',
    });
    expect(result.missions).toEqual([
      expect.objectContaining({
        missionId: 'mission-1',
        status: 'completed',
        progressId: 'progress-1',
        rewardXp: 10,
      }),
    ]);
  });
});

function overviewFixture(): StudentHeroOverviewReadModel {
  return {
    currentXp: 25,
    badges: [badgeFixture()],
    missions: missionsFixture().missions,
    rewardsSummary: {
      totalHeroXp: 10,
      completedMissions: 1,
      rewardRedemptions: { requested: 0, approved: 0, fulfilled: 0 },
    },
  };
}

function missionsFixture(): StudentHeroMissionsReadModel {
  return {
    missions: [
      {
        mission: missionFixture(),
        progress: progressFixture(),
      },
    ],
    page: 1,
    limit: 50,
    total: 1,
  };
}

function missionDetailFixture(): StudentHeroMissionDetailReadModel {
  return {
    mission: missionFixture(),
    progress: progressFixture(),
  };
}

function missionFixture() {
  return {
    id: 'mission-1',
    subjectId: 'subject-1',
    titleEn: 'Hero Mission',
    titleAr: null,
    briefEn: 'Read-only mission brief',
    briefAr: null,
    requiredLevel: 1,
    rewardXp: 10,
    positionX: 10,
    positionY: 20,
    sortOrder: 1,
    badgeReward: {
      id: 'badge-1',
      slug: 'brave-reader',
      nameEn: 'Brave Reader',
      nameAr: null,
      descriptionEn: 'Completed a mission',
      descriptionAr: null,
      assetPath: 'raw-asset-path',
      fileId: 'raw-file-id',
    },
    objectives: [
      {
        id: 'objective-1',
        type: HeroMissionObjectiveType.QUIZ,
        titleEn: 'Finish the quiz',
        titleAr: null,
        subtitleEn: 'Chapter 1',
        subtitleAr: null,
        sortOrder: 1,
        isRequired: true,
      },
    ],
  };
}

function progressFixture() {
  return {
    id: 'progress-1',
    missionId: 'mission-1',
    status: HeroMissionProgressStatus.COMPLETED,
    progressPercent: 100,
    startedAt: new Date('2026-10-01T08:00:00.000Z'),
    completedAt: new Date('2026-10-02T08:00:00.000Z'),
    lastActivityAt: new Date('2026-10-02T08:00:00.000Z'),
    objectiveProgress: [
      {
        objectiveId: 'objective-1',
        completedAt: new Date('2026-10-02T08:00:00.000Z'),
      },
    ],
  };
}

function badgeFixture() {
  return {
    id: 'student-badge-1',
    badgeId: 'badge-1',
    missionId: 'mission-1',
    earnedAt: new Date('2026-10-02T08:00:00.000Z'),
    badge: {
      id: 'badge-1',
      slug: 'brave-reader',
      nameEn: 'Brave Reader',
      nameAr: null,
      descriptionEn: 'Completed a mission',
      descriptionAr: null,
      assetPath: 'raw-asset-path',
      fileId: 'raw-file-id',
    },
  };
}
