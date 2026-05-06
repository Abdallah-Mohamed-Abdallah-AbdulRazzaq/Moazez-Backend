import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const STUDENT_HERO_PROGRESS_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
] as const;

export type StudentHeroProgressStatus =
  (typeof STUDENT_HERO_PROGRESS_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentHeroMissionsQueryDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_HERO_PROGRESS_STATUSES)
  status?: StudentHeroProgressStatus;

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

export class StudentHeroUnsupportedDto {
  rank!: true;
  tier!: true;
  level!: true;
  streakDays!: true;
  requiredXp!: true;
}

export class StudentHeroStatsDto {
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
  unsupported!: StudentHeroUnsupportedDto;
}

export class StudentHeroLevelDto {
  id!: string;
  missionId!: string;
  title!: string | null;
  status!: 'locked' | 'active' | 'completed';
  positionX!: number | null;
  positionY!: number | null;
  position_x!: number | null;
  position_y!: number | null;
}

export class StudentHeroBadgeDto {
  id!: string;
  badgeId!: string;
  slug!: string;
  name!: string | null;
  description!: string | null;
  imageUrl!: string | null;
  earnedAt!: string;
  missionId!: string | null;
}

export class StudentHeroBadgesResponseDto {
  summary!: {
    collected: number;
  };
  badges!: StudentHeroBadgeDto[];
}

export class StudentHeroRewardsSummaryDto {
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

export class StudentHeroMissionObjectiveDto {
  id!: string;
  title!: string | null;
  subtitle!: string | null;
  type!: string;
  isCompleted!: boolean;
  is_completed!: boolean;
}

export class StudentHeroMissionBadgeRewardDto {
  badgeId!: string;
  slug!: string;
  name!: string | null;
  imageUrl!: string | null;
}

export class StudentHeroMissionListItemDto {
  id!: string;
  missionId!: string;
  title!: string | null;
  status!: StudentHeroProgressStatus;
  journeyStatus!: 'locked' | 'active' | 'completed';
  progressId!: string | null;
  progressPercent!: number;
  requiredLevel!: number | null;
  rewardXp!: number;
  badgeReward!: StudentHeroMissionBadgeRewardDto | null;
  positionX!: number | null;
  positionY!: number | null;
  mission_id!: string;
  progress_id!: string | null;
  progress_percent!: number;
  required_level!: number | null;
  reward_xp!: number;
  badge_reward!: StudentHeroMissionBadgeRewardDto | null;
}

export class StudentHeroPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentHeroMissionsResponseDto {
  missions!: StudentHeroMissionListItemDto[];
  pagination!: StudentHeroPaginationDto;
  visibility!: {
    missionStatus: 'published';
    reason: string;
  };
}

export class StudentHeroMissionDetailResponseDto {
  id!: string;
  missionId!: string;
  title!: string | null;
  status!: 'locked' | 'active' | 'completed';
  progressStatus!: StudentHeroProgressStatus;
  requiredLevel!: number | null;
  required_level!: number | null;
  cover_image_url!: string | null;
  missionBrief!: string | null;
  mission_brief!: string | null;
  objectives!: StudentHeroMissionObjectiveDto[];
  rewards!: {
    xp: number;
    next_rank_title: string | null;
    badge: StudentHeroMissionBadgeRewardDto | null;
  };
  progress!: {
    progressId: string | null;
    progressPercent: number;
    startedAt: string | null;
    completedAt: string | null;
  };
  unsupported!: StudentHeroUnsupportedDto;
}

export class StudentHeroProgressResponseDto {
  summary!: {
    total: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    not_started: number;
    in_progress: number;
  };
  missions!: StudentHeroMissionListItemDto[];
  unsupported!: StudentHeroUnsupportedDto;
}

export class StudentHeroOverviewResponseDto {
  stats!: StudentHeroStatsDto;
  levels!: StudentHeroLevelDto[];
  progress!: StudentHeroProgressResponseDto;
  badges!: StudentHeroBadgesResponseDto;
  rewardsSummary!: StudentHeroRewardsSummaryDto;
  rewards_summary!: StudentHeroRewardsSummaryDto;
  unsupported!: StudentHeroUnsupportedDto;
}
