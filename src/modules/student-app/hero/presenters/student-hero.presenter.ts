import {
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
} from '@prisma/client';
import {
  StudentHeroBadgeDto,
  StudentHeroBadgesResponseDto,
  StudentHeroLevelDto,
  StudentHeroMissionBadgeRewardDto,
  StudentHeroMissionDetailResponseDto,
  StudentHeroMissionListItemDto,
  StudentHeroMissionObjectiveDto,
  StudentHeroMissionsResponseDto,
  StudentHeroOverviewResponseDto,
  StudentHeroProgressResponseDto,
  StudentHeroRewardsSummaryDto,
  StudentHeroStatsDto,
  StudentHeroUnsupportedDto,
} from '../dto/student-hero.dto';
import {
  presentProgressStatus,
  type StudentHeroBadgeReadModel,
  type StudentHeroMissionDetailReadModel,
  type StudentHeroMissionReadModel,
  type StudentHeroMissionsReadModel,
  type StudentHeroMissionWithProgressReadModel,
  type StudentHeroOverviewReadModel,
  type StudentHeroProgressReadModel,
  type StudentHeroProgressSummaryReadModel,
  type StudentHeroRewardsSummaryReadModel,
} from '../infrastructure/student-hero-read.adapter';

const UNSUPPORTED: StudentHeroUnsupportedDto = {
  rank: true,
  tier: true,
  level: true,
  streakDays: true,
  requiredXp: true,
};

const MISSION_VISIBILITY = {
  missionStatus: 'published' as const,
  reason: 'published_stage_term_missions_only',
};

export class StudentHeroPresenter {
  static presentOverview(
    result: StudentHeroOverviewReadModel,
  ): StudentHeroOverviewResponseDto {
    const progress = this.presentProgress({ missions: result.missions });
    const badges = this.presentBadges(result.badges);
    const rewardsSummary = presentRewardsSummary(result.rewardsSummary);

    return {
      stats: presentStats({
        currentXp: result.currentXp,
        badgesCollected: result.badges.length,
      }),
      levels: result.missions.map((item) => presentLevel(item)),
      progress,
      badges,
      rewardsSummary,
      rewards_summary: rewardsSummary,
      unsupported: UNSUPPORTED,
    };
  }

  static presentProgress(
    result: StudentHeroProgressSummaryReadModel,
  ): StudentHeroProgressResponseDto {
    const missions = result.missions.map((item) =>
      presentMissionListItem(item),
    );
    const counts = summarizeProgress(missions);

    return {
      summary: {
        total: missions.length,
        notStarted: counts.notStarted,
        inProgress: counts.inProgress,
        completed: counts.completed,
        not_started: counts.notStarted,
        in_progress: counts.inProgress,
      },
      missions,
      unsupported: UNSUPPORTED,
    };
  }

  static presentBadges(
    badges: StudentHeroBadgeReadModel[],
  ): StudentHeroBadgesResponseDto {
    return {
      summary: {
        collected: badges.length,
      },
      badges: badges.map((badge) => presentBadge(badge)),
    };
  }

  static presentMissions(
    result: StudentHeroMissionsReadModel,
  ): StudentHeroMissionsResponseDto {
    return {
      missions: result.missions.map((item) => presentMissionListItem(item)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      visibility: MISSION_VISIBILITY,
    };
  }

  static presentMissionDetail(
    result: StudentHeroMissionDetailReadModel,
  ): StudentHeroMissionDetailResponseDto {
    const mission = result.mission;
    const progressStatus = presentProgressStatus(result.progress);
    const journeyStatus = presentJourneyStatus(result.progress);

    return {
      id: mission.id,
      missionId: mission.id,
      title: displayName(mission),
      status: journeyStatus,
      progressStatus,
      requiredLevel: mission.requiredLevel ?? null,
      required_level: mission.requiredLevel ?? null,
      cover_image_url: null,
      missionBrief: mission.briefEn ?? mission.briefAr ?? null,
      mission_brief: mission.briefEn ?? mission.briefAr ?? null,
      objectives: mission.objectives.map((objective) =>
        presentObjective(objective, result.progress),
      ),
      rewards: {
        xp: mission.rewardXp,
        next_rank_title: null,
        badge: presentBadgeReward(mission.badgeReward),
      },
      progress: {
        progressId: result.progress?.id ?? null,
        progressPercent: result.progress?.progressPercent ?? 0,
        startedAt: presentNullableDate(result.progress?.startedAt ?? null),
        completedAt: presentNullableDate(result.progress?.completedAt ?? null),
      },
      unsupported: UNSUPPORTED,
    };
  }
}

function presentStats(params: {
  currentXp: number;
  badgesCollected: number;
}): StudentHeroStatsDto {
  return {
    heroName: null,
    heroRankTitle: null,
    level: null,
    currentXp: params.currentXp,
    requiredXp: null,
    badgesCollected: params.badgesCollected,
    streakDays: null,
    hero_name: null,
    hero_rank_title: null,
    current_xp: params.currentXp,
    required_xp: null,
    badges_collected: params.badgesCollected,
    streak_days: null,
    unsupported: UNSUPPORTED,
  };
}

function presentLevel(
  item: StudentHeroMissionWithProgressReadModel,
): StudentHeroLevelDto {
  return {
    id: item.mission.id,
    missionId: item.mission.id,
    title: displayName(item.mission),
    status: presentJourneyStatus(item.progress),
    positionX: normalizePosition(item.mission.positionX),
    positionY: normalizePosition(item.mission.positionY),
    position_x: normalizePosition(item.mission.positionX),
    position_y: normalizePosition(item.mission.positionY),
  };
}

function presentMissionListItem(
  item: StudentHeroMissionWithProgressReadModel,
): StudentHeroMissionListItemDto {
  const status = presentProgressStatus(item.progress);

  return {
    id: item.mission.id,
    missionId: item.mission.id,
    title: displayName(item.mission),
    status,
    journeyStatus: presentJourneyStatus(item.progress),
    progressId: item.progress?.id ?? null,
    progressPercent: item.progress?.progressPercent ?? 0,
    requiredLevel: item.mission.requiredLevel ?? null,
    rewardXp: item.mission.rewardXp,
    badgeReward: presentBadgeReward(item.mission.badgeReward),
    positionX: normalizePosition(item.mission.positionX),
    positionY: normalizePosition(item.mission.positionY),
    mission_id: item.mission.id,
    progress_id: item.progress?.id ?? null,
    progress_percent: item.progress?.progressPercent ?? 0,
    required_level: item.mission.requiredLevel ?? null,
    reward_xp: item.mission.rewardXp,
    badge_reward: presentBadgeReward(item.mission.badgeReward),
  };
}

function presentBadge(badge: StudentHeroBadgeReadModel): StudentHeroBadgeDto {
  return {
    id: badge.id,
    badgeId: badge.badgeId,
    slug: badge.badge.slug,
    name: badge.badge.nameEn ?? badge.badge.nameAr ?? null,
    description: badge.badge.descriptionEn ?? badge.badge.descriptionAr ?? null,
    imageUrl: null,
    earnedAt: badge.earnedAt.toISOString(),
    missionId: badge.missionId,
  };
}

function presentBadgeReward(
  badge: StudentHeroMissionReadModel['badgeReward'],
): StudentHeroMissionBadgeRewardDto | null {
  if (!badge) return null;

  return {
    badgeId: badge.id,
    slug: badge.slug,
    name: badge.nameEn ?? badge.nameAr ?? null,
    imageUrl: null,
  };
}

function presentObjective(
  objective: StudentHeroMissionReadModel['objectives'][number],
  progress: StudentHeroProgressReadModel | null,
): StudentHeroMissionObjectiveDto {
  const objectiveProgress = progress?.objectiveProgress.find(
    (item) => item.objectiveId === objective.id,
  );

  return {
    id: objective.id,
    title: objective.titleEn ?? objective.titleAr ?? null,
    subtitle: objective.subtitleEn ?? objective.subtitleAr ?? null,
    type: presentObjectiveType(objective.type),
    isCompleted: Boolean(objectiveProgress?.completedAt),
    is_completed: Boolean(objectiveProgress?.completedAt),
  };
}

function presentRewardsSummary(
  summary: StudentHeroRewardsSummaryReadModel,
): StudentHeroRewardsSummaryDto {
  return {
    totalHeroXp: summary.totalHeroXp,
    total_hero_xp: summary.totalHeroXp,
    completedMissions: summary.completedMissions,
    completed_missions: summary.completedMissions,
    rewardRedemptions: summary.rewardRedemptions,
    reward_redemptions: summary.rewardRedemptions,
  };
}

function presentJourneyStatus(
  progress: StudentHeroProgressReadModel | null,
): 'locked' | 'active' | 'completed' {
  if (progress?.status === HeroMissionProgressStatus.COMPLETED) {
    return 'completed';
  }

  return 'active';
}

function presentObjectiveType(type: HeroMissionObjectiveType): string {
  return String(type).toLowerCase();
}

function summarizeProgress(missions: StudentHeroMissionListItemDto[]): {
  notStarted: number;
  inProgress: number;
  completed: number;
} {
  return missions.reduce(
    (summary, mission) => {
      if (mission.status === 'completed') summary.completed += 1;
      else if (mission.status === 'in_progress') summary.inProgress += 1;
      else summary.notStarted += 1;
      return summary;
    },
    { notStarted: 0, inProgress: 0, completed: 0 },
  );
}

function displayName(mission: {
  titleEn: string | null;
  titleAr: string | null;
}): string | null {
  return mission.titleEn ?? mission.titleAr ?? null;
}

function normalizePosition(value: number | null): number | null {
  if (value === null) return null;
  if (value >= 0 && value <= 1) return value;
  return Math.round((value / 100) * 1000) / 1000;
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
