import {
  HeroMissionObjectiveType,
  HeroMissionStatus,
} from '@prisma/client';
import {
  presentHeroBadge,
  presentHeroMissionDetail,
  presentHeroMissionRow,
} from '../presenters/hero-journey.presenter';

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey presenter', () => {
  it('presents badges without internal schoolId or metadata', () => {
    const result = presentHeroBadge({
      id: 'badge-1',
      schoolId: 'school-1',
      slug: 'speed-runner',
      nameEn: 'Speed Runner',
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      assetPath: '/badges/speed.svg',
      fileId: null,
      sortOrder: 1,
      isActive: true,
      metadata: { internal: true },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });

    expect(result).toMatchObject({
      id: 'badge-1',
      slug: 'speed-runner',
      createdAt: NOW.toISOString(),
    });
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('metadata');
  });

  it('maps mission enums to lowercase and includes list summaries', () => {
    const result = presentHeroMissionRow(missionRecord());

    expect(result).toMatchObject({
      id: 'mission-1',
      yearId: 'year-1',
      status: 'published',
      badgeReward: {
        id: 'badge-1',
        slug: 'speed-runner',
      },
      objectivesCount: 1,
    });
    expect(result).not.toHaveProperty('schoolId');
  });

  it('presents mission detail objectives and actor fields without schoolId', () => {
    const result = presentHeroMissionDetail(missionRecord());

    expect(result).toMatchObject({
      publishedById: 'publisher-1',
      archivedById: null,
      createdById: 'creator-1',
      objectives: [
        {
          id: 'objective-1',
          type: 'quiz',
          titleEn: 'Quiz objective',
          sortOrder: 1,
          isRequired: true,
        },
      ],
    });
    expect(result.objectives[0]).not.toHaveProperty('schoolId');
  });

  function missionRecord() {
    return {
      id: 'mission-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      stageId: 'stage-1',
      subjectId: 'subject-1',
      linkedAssessmentId: null,
      linkedLessonRef: 'lesson-1',
      titleEn: 'Mission',
      titleAr: null,
      briefEn: 'Brief',
      briefAr: null,
      requiredLevel: 2,
      rewardXp: 25,
      badgeRewardId: 'badge-1',
      status: HeroMissionStatus.PUBLISHED,
      positionX: 10,
      positionY: 20,
      sortOrder: 1,
      publishedAt: NOW,
      publishedById: 'publisher-1',
      archivedAt: null,
      archivedById: null,
      createdById: 'creator-1',
      metadata: { internal: true },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      badgeReward: {
        id: 'badge-1',
        slug: 'speed-runner',
        nameEn: 'Speed Runner',
        nameAr: null,
        assetPath: '/badges/speed.svg',
        fileId: null,
        isActive: true,
      },
      objectives: [
        {
          id: 'objective-1',
          schoolId: 'school-1',
          missionId: 'mission-1',
          type: HeroMissionObjectiveType.QUIZ,
          titleEn: 'Quiz objective',
          titleAr: null,
          subtitleEn: null,
          subtitleAr: null,
          linkedAssessmentId: null,
          linkedLessonRef: null,
          sortOrder: 1,
          isRequired: true,
          metadata: { internal: true },
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        },
      ],
    } as never;
  }
});
