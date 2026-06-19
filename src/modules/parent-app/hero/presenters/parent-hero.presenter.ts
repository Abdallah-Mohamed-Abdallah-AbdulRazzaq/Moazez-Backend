import {
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
} from '@prisma/client';
import {
  ParentHeroBadgeDto,
  ParentHeroBadgesResponseDto,
  ParentHeroBadgeRewardDto,
  ParentHeroChildDto,
  ParentHeroLevelDto,
  ParentHeroMissionDetailResponseDto,
  ParentHeroMissionListItemDto,
  ParentHeroMissionObjectiveDto,
  ParentHeroMissionsResponseDto,
  ParentHeroOverviewResponseDto,
  ParentHeroProgressResponseDto,
  ParentHeroRewardsSummaryDto,
  ParentHeroStatsDto,
  ParentHeroUnsupportedDto,
} from '../dto/parent-hero.dto';
import {
  presentParentHeroProgressStatus,
  type ParentHeroBadgeReadModel,
  type ParentHeroMissionDetailReadModel,
  type ParentHeroMissionReadModel,
  type ParentHeroMissionsReadModel,
  type ParentHeroMissionWithProgressReadModel,
  type ParentHeroOverviewReadModel,
  type ParentHeroProgressReadModel,
  type ParentHeroProgressSummaryReadModel,
  type ParentHeroRewardsSummaryReadModel,
} from '../infrastructure/parent-hero-read.adapter';

const UNSUPPORTED: ParentHeroUnsupportedDto = {
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

export class ParentHeroPresenter {
  static presentOverview(
    result: ParentHeroOverviewReadModel,
  ): ParentHeroOverviewResponseDto {
    const progress = this.presentProgress({
      child: result.child,
      missions: result.missions,
    });
    const badges = this.presentBadges(result.child, result.badges);
    const rewardsSummary = presentRewardsSummary(result.rewardsSummary);

    return {
      child: presentChild(result.child),
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
    result: ParentHeroProgressSummaryReadModel,
  ): ParentHeroProgressResponseDto {
    const missions = result.missions.map((item) =>
      presentMissionListItem(item),
    );
    const counts = summarizeProgress(missions);

    return {
      child: presentChild(result.child),
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
    child: { studentId: string },
    badges: ParentHeroBadgeReadModel[],
  ): ParentHeroBadgesResponseDto {
    return {
      child: presentChild(child),
      summary: {
        collected: badges.length,
      },
      badges: badges.map((badge) => presentBadge(badge)),
    };
  }

  static presentMissions(
    result: ParentHeroMissionsReadModel,
  ): ParentHeroMissionsResponseDto {
    return {
      child: presentChild(result.child),
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
    result: ParentHeroMissionDetailReadModel,
  ): ParentHeroMissionDetailResponseDto {
    const mission = result.mission;
    const progressStatus = presentParentHeroProgressStatus(result.progress);
    const journeyStatus = presentJourneyStatus(result.progress);

    return {
      child: presentChild(result.child),
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
        progressPercent: result.progress?.progressPercent ?? 0,
        startedAt: presentNullableDate(result.progress?.startedAt ?? null),
        completedAt: presentNullableDate(result.progress?.completedAt ?? null),
      },
      unsupported: UNSUPPORTED,
    };
  }
}

function presentChild(child: { studentId: string }): ParentHeroChildDto {
  return {
    studentId: child.studentId,
    student_id: child.studentId,
  };
}

function presentStats(params: {
  currentXp: number;
  badgesCollected: number;
}): ParentHeroStatsDto {
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
  item: ParentHeroMissionWithProgressReadModel,
): ParentHeroLevelDto {
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
  item: ParentHeroMissionWithProgressReadModel,
): ParentHeroMissionListItemDto {
  const status = presentParentHeroProgressStatus(item.progress);

  return {
    id: item.mission.id,
    missionId: item.mission.id,
    title: displayName(item.mission),
    status,
    journeyStatus: presentJourneyStatus(item.progress),
    progressPercent: item.progress?.progressPercent ?? 0,
    requiredLevel: item.mission.requiredLevel ?? null,
    rewardXp: item.mission.rewardXp,
    badgeReward: presentBadgeReward(item.mission.badgeReward),
    positionX: normalizePosition(item.mission.positionX),
    positionY: normalizePosition(item.mission.positionY),
    mission_id: item.mission.id,
    progress_percent: item.progress?.progressPercent ?? 0,
    required_level: item.mission.requiredLevel ?? null,
    reward_xp: item.mission.rewardXp,
    badge_reward: presentBadgeReward(item.mission.badgeReward),
  };
}

function presentBadge(badge: ParentHeroBadgeReadModel): ParentHeroBadgeDto {
  return {
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
  badge: ParentHeroMissionReadModel['badgeReward'],
): ParentHeroBadgeRewardDto | null {
  if (!badge) return null;

  return {
    badgeId: badge.id,
    slug: badge.slug,
    name: badge.nameEn ?? badge.nameAr ?? null,
    imageUrl: null,
  };
}

function presentObjective(
  objective: ParentHeroMissionReadModel['objectives'][number],
  progress: ParentHeroProgressReadModel | null,
): ParentHeroMissionObjectiveDto {
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
  summary: ParentHeroRewardsSummaryReadModel,
): ParentHeroRewardsSummaryDto {
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
  progress: ParentHeroProgressReadModel | null,
): 'locked' | 'active' | 'completed' {
  if (progress?.status === HeroMissionProgressStatus.COMPLETED) {
    return 'completed';
  }

  return 'active';
}

function presentObjectiveType(type: HeroMissionObjectiveType): string {
  return String(type).toLowerCase();
}

function summarizeProgress(missions: ParentHeroMissionListItemDto[]): {
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
