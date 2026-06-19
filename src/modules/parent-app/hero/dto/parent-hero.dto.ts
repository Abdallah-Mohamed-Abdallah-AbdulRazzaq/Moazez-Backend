import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const HERO_PROGRESS_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
] as const;

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ParentHeroMissionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(HERO_PROGRESS_STATUSES)
  status?: 'not_started' | 'in_progress' | 'completed';

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ParentHeroChildDto {
  studentId!: string;
  student_id!: string;
}

export class ParentHeroUnsupportedDto {
  rank!: true;
  tier!: true;
  level!: true;
  streakDays!: true;
  requiredXp!: true;
}

export class ParentHeroStatsDto {
  heroName!: string | null;
  heroRankTitle!: string | null;
  level!: number | null;
  currentXp!: number;
  requiredXp!: number | null;
  badgesCollected!: number;
  streakDays!: number | null;
  hero_name!: string | null;
  hero_rank_title!: string | null;
  current_xp!: number;
  required_xp!: number | null;
  badges_collected!: number;
  streak_days!: number | null;
  unsupported!: ParentHeroUnsupportedDto;
}

export class ParentHeroBadgeRewardDto {
  badgeId!: string;
  slug!: string;
  name!: string | null;
  imageUrl!: string | null;
}

export class ParentHeroLevelDto {
  id!: string;
  missionId!: string;
  title!: string | null;
  status!: 'locked' | 'active' | 'completed';
  positionX!: number | null;
  positionY!: number | null;
  position_x!: number | null;
  position_y!: number | null;
}

export class ParentHeroMissionListItemDto {
  id!: string;
  missionId!: string;
  mission_id!: string;
  title!: string | null;
  status!: 'not_started' | 'in_progress' | 'completed';
  journeyStatus!: 'locked' | 'active' | 'completed';
  progressPercent!: number;
  progress_percent!: number;
  requiredLevel!: number | null;
  required_level!: number | null;
  rewardXp!: number;
  reward_xp!: number;
  badgeReward!: ParentHeroBadgeRewardDto | null;
  badge_reward!: ParentHeroBadgeRewardDto | null;
  positionX!: number | null;
  positionY!: number | null;
}

export class ParentHeroMissionObjectiveDto {
  id!: string;
  title!: string | null;
  subtitle!: string | null;
  type!: string;
  isCompleted!: boolean;
  is_completed!: boolean;
}

export class ParentHeroMissionDetailResponseDto {
  child!: ParentHeroChildDto;
  id!: string;
  missionId!: string;
  title!: string | null;
  status!: 'locked' | 'active' | 'completed';
  progressStatus!: 'not_started' | 'in_progress' | 'completed';
  requiredLevel!: number | null;
  required_level!: number | null;
  cover_image_url!: string | null;
  missionBrief!: string | null;
  mission_brief!: string | null;
  objectives!: ParentHeroMissionObjectiveDto[];
  rewards!: {
    xp: number;
    next_rank_title: string | null;
    badge: ParentHeroBadgeRewardDto | null;
  };
  progress!: {
    progressPercent: number;
    startedAt: string | null;
    completedAt: string | null;
  };
  unsupported!: ParentHeroUnsupportedDto;
}

export class ParentHeroBadgeDto {
  badgeId!: string;
  slug!: string;
  name!: string | null;
  description!: string | null;
  imageUrl!: string | null;
  earnedAt!: string;
  missionId!: string | null;
}

export class ParentHeroBadgesResponseDto {
  child!: ParentHeroChildDto;
  summary!: {
    collected: number;
  };
  badges!: ParentHeroBadgeDto[];
}

export class ParentHeroProgressResponseDto {
  child!: ParentHeroChildDto;
  summary!: {
    total: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    not_started: number;
    in_progress: number;
  };
  missions!: ParentHeroMissionListItemDto[];
  unsupported!: ParentHeroUnsupportedDto;
}

export class ParentHeroRewardsSummaryDto {
  totalHeroXp!: number;
  total_hero_xp!: number;
  completedMissions!: number;
  completed_missions!: number;
  rewardRedemptions!: {
    requested: number;
    approved: number;
    fulfilled: number;
  };
  reward_redemptions!: {
    requested: number;
    approved: number;
    fulfilled: number;
  };
}

export class ParentHeroOverviewResponseDto {
  child!: ParentHeroChildDto;
  stats!: ParentHeroStatsDto;
  levels!: ParentHeroLevelDto[];
  progress!: ParentHeroProgressResponseDto;
  badges!: ParentHeroBadgesResponseDto;
  rewardsSummary!: ParentHeroRewardsSummaryDto;
  rewards_summary!: ParentHeroRewardsSummaryDto;
  unsupported!: ParentHeroUnsupportedDto;
}

export class ParentHeroMissionsResponseDto {
  child!: ParentHeroChildDto;
  missions!: ParentHeroMissionListItemDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
  visibility!: {
    missionStatus: 'published';
    reason: string;
  };
}
