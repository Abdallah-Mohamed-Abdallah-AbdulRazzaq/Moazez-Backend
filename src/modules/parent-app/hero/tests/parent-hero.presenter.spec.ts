import {
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
} from '@prisma/client';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentHeroPresenter } from '../presenters/parent-hero.presenter';
import type {
  ParentHeroMissionDetailReadModel,
  ParentHeroMissionsReadModel,
  ParentHeroOverviewReadModel,
} from '../infrastructure/parent-hero-read.adapter';

describe('ParentHeroPresenter', () => {
  it('presents linked-child hero overview without internal ownership, ledger, or storage fields', () => {
    const result = ParentHeroPresenter.presentOverview(overviewFixture());
    const serialized = JSON.stringify(result);

    expect(result.child).toEqual({
      studentId: 'student-1',
      student_id: 'student-1',
    });
    expect(result.stats).toMatchObject({
      currentXp: 25,
      badgesCollected: 1,
      level: null,
      requiredXp: null,
    });
    expect(result.levels).toEqual([
      expect.objectContaining({
        missionId: 'mission-1',
        status: 'completed',
        positionX: 0.1,
        positionY: 0.2,
      }),
    ]);
    expectSafeParentHeroPayload(serialized);
  });

  it('presents mission detail without progress ids, actor ids, or mutation side effects', () => {
    const result = ParentHeroPresenter.presentMissionDetail(
      missionDetailFixture(),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      missionId: 'mission-1',
      status: 'completed',
      progressStatus: 'completed',
      progress: {
        progressPercent: 100,
        startedAt: '2026-10-01T08:00:00.000Z',
        completedAt: '2026-10-02T08:00:00.000Z',
      },
      rewards: {
        xp: 10,
        badge: {
          badgeId: 'badge-1',
          slug: 'brave-reader',
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
    expect(serialized).not.toContain('progressId');
    expect(serialized).not.toContain('progress_id');
    expectSafeParentHeroPayload(serialized);
  });

  it('uses published mission visibility and read-only progress statuses for mission lists', () => {
    const result = ParentHeroPresenter.presentMissions(missionsFixture());
    const serialized = JSON.stringify(result);

    expect(result.visibility).toEqual({
      missionStatus: 'published',
      reason: 'published_stage_term_missions_only',
    });
    expect(result.missions).toEqual([
      expect.objectContaining({
        missionId: 'mission-1',
        status: 'completed',
        rewardXp: 10,
      }),
    ]);
    expect(serialized).not.toContain('progressId');
    expectSafeParentHeroPayload(serialized);
  });
});

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function overviewFixture(): ParentHeroOverviewReadModel {
  return {
    child: childFixture(),
    currentXp: 25,
    badges: [badgeFixture()],
    missions: missionsFixture().missions,
    rewardsSummary: {
      totalHeroXp: 10,
      completedMissions: 1,
      rewardRedemptions: { requested: 1, approved: 0, fulfilled: 0 },
    },
  };
}

function missionsFixture(): ParentHeroMissionsReadModel {
  return {
    child: childFixture(),
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

function missionDetailFixture(): ParentHeroMissionDetailReadModel {
  return {
    child: childFixture(),
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
    id: 'hidden-progress-1',
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
        completedById: 'hidden-completer',
        metadata: { objectKey: 'hidden-object-key' },
      },
    ],
    enrollmentId: 'hidden-enrollment',
    xpLedgerId: 'hidden-xp-ledger',
    metadata: { signedUrl: 'https://storage.invalid/progress' },
  };
}

function badgeFixture() {
  return {
    id: 'hidden-student-badge-1',
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
      schoolId: 'hidden-school',
      metadata: { bucket: 'hidden-bucket' },
    },
    awardedById: 'hidden-awarder',
    metadata: { BehaviorPointLedger: 'not-xp' },
  };
}

function expectSafeParentHeroPayload(serialized: string): void {
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'deletedAt',
    'enrollmentId',
    'guardianId',
    'parentId',
    'studentGuardianId',
    'awardedById',
    'createdById',
    'updatedById',
    'completedById',
    'xpLedgerId',
    'ledgerEntryId',
    'metadata',
    'assetPath',
    'fileId',
    'objectKey',
    'bucket',
    'signedUrl',
    'storage.invalid',
    'RewardRedemption',
    'BehaviorPointLedger',
    'wallet',
    'finance',
    'payment',
    'grant',
    'redeem',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
