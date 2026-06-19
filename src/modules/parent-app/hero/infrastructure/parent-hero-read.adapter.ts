import { Injectable } from '@nestjs/common';
import {
  HeroMissionProgressStatus,
  HeroMissionStatus,
  Prisma,
  RewardRedemptionStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type { ParentHeroMissionsQueryDto } from '../dto/parent-hero.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const PARENT_HERO_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      classroom: {
        select: {
          id: true,
          section: {
            select: {
              id: true,
              grade: {
                select: {
                  id: true,
                  stage: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

const PARENT_HERO_BADGE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  descriptionEn: true,
  descriptionAr: true,
} satisfies Prisma.HeroBadgeSelect;

const PARENT_HERO_OBJECTIVE_SELECT = {
  id: true,
  type: true,
  titleEn: true,
  titleAr: true,
  subtitleEn: true,
  subtitleAr: true,
  sortOrder: true,
  isRequired: true,
} satisfies Prisma.HeroMissionObjectiveSelect;

const PARENT_HERO_MISSION_ARGS =
  Prisma.validator<Prisma.HeroMissionDefaultArgs>()({
    select: {
      id: true,
      subjectId: true,
      titleEn: true,
      titleAr: true,
      briefEn: true,
      briefAr: true,
      requiredLevel: true,
      rewardXp: true,
      positionX: true,
      positionY: true,
      sortOrder: true,
      badgeReward: {
        select: PARENT_HERO_BADGE_SUMMARY_SELECT,
      },
      objectives: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: PARENT_HERO_OBJECTIVE_SELECT,
      },
    },
  });

const PARENT_HERO_PROGRESS_ARGS =
  Prisma.validator<Prisma.HeroMissionProgressDefaultArgs>()({
    select: {
      missionId: true,
      status: true,
      progressPercent: true,
      startedAt: true,
      completedAt: true,
      lastActivityAt: true,
      objectiveProgress: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          objectiveId: true,
          completedAt: true,
        },
      },
    },
  });

const PARENT_HERO_STUDENT_BADGE_ARGS =
  Prisma.validator<Prisma.HeroStudentBadgeDefaultArgs>()({
    select: {
      badgeId: true,
      missionId: true,
      earnedAt: true,
      badge: {
        select: PARENT_HERO_BADGE_SUMMARY_SELECT,
      },
    },
  });

export type ParentHeroEnrollmentReadModel = Prisma.EnrollmentGetPayload<
  typeof PARENT_HERO_ENROLLMENT_ARGS
>;
export type ParentHeroMissionReadModel = Prisma.HeroMissionGetPayload<
  typeof PARENT_HERO_MISSION_ARGS
>;
export type ParentHeroProgressReadModel = Prisma.HeroMissionProgressGetPayload<
  typeof PARENT_HERO_PROGRESS_ARGS
>;
export type ParentHeroBadgeReadModel = Prisma.HeroStudentBadgeGetPayload<
  typeof PARENT_HERO_STUDENT_BADGE_ARGS
>;

export interface ParentHeroMissionWithProgressReadModel {
  mission: ParentHeroMissionReadModel;
  progress: ParentHeroProgressReadModel | null;
}

export interface ParentHeroMissionsReadModel {
  child: ParentAppAccessibleChild;
  missions: ParentHeroMissionWithProgressReadModel[];
  page: number;
  limit: number;
  total: number;
}

export interface ParentHeroProgressSummaryReadModel {
  child: ParentAppAccessibleChild;
  missions: ParentHeroMissionWithProgressReadModel[];
}

export interface ParentHeroRewardsSummaryReadModel {
  totalHeroXp: number;
  completedMissions: number;
  rewardRedemptions: {
    requested: number;
    approved: number;
    fulfilled: number;
  };
}

export interface ParentHeroOverviewReadModel {
  child: ParentAppAccessibleChild;
  currentXp: number;
  badges: ParentHeroBadgeReadModel[];
  missions: ParentHeroMissionWithProgressReadModel[];
  rewardsSummary: ParentHeroRewardsSummaryReadModel;
}

export interface ParentHeroMissionDetailReadModel {
  child: ParentAppAccessibleChild;
  mission: ParentHeroMissionReadModel;
  progress: ParentHeroProgressReadModel | null;
}

@Injectable()
export class ParentHeroReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getHeroOverview(
    child: ParentAppAccessibleChild,
  ): Promise<ParentHeroOverviewReadModel> {
    const [currentXp, badges, progress, rewardsSummary] = await Promise.all([
      this.sumCurrentXp(child),
      this.listBadges(child),
      this.getHeroProgress(child),
      this.getRewardsSummary(child),
    ]);

    return {
      child,
      currentXp,
      badges,
      missions: progress.missions,
      rewardsSummary,
    };
  }

  async getHeroProgress(
    child: ParentAppAccessibleChild,
  ): Promise<ParentHeroProgressSummaryReadModel> {
    const result = await this.listMissions(child, { limit: MAX_LIMIT });
    return { child, missions: result.missions };
  }

  async listMissions(
    child: ParentAppAccessibleChild,
    query?: ParentHeroMissionsQueryDto,
  ): Promise<ParentHeroMissionsReadModel> {
    const page = resolvePage(query?.page);
    const limit = resolveLimit(query?.limit, DEFAULT_LIMIT);

    if (!child.termId) {
      return { child, missions: [], page, limit, total: 0 };
    }

    const enrollment = await this.findEnrollmentContext(child);
    const stageId = enrollment.classroom.section.grade.stage.id;
    const missions = await this.scopedPrisma.heroMission.findMany({
      where: {
        academicYearId: child.academicYearId,
        termId: child.termId,
        stageId,
        status: HeroMissionStatus.PUBLISHED,
        deletedAt: null,
        ...(query?.subjectId ? { subjectId: query.subjectId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...PARENT_HERO_MISSION_ARGS,
    });
    const progress = await this.listProgressForMissions({
      child,
      missionIds: missions.map((mission) => mission.id),
    });
    const progressByMissionId = new Map(
      progress.map((item) => [item.missionId, item]),
    );
    const withProgress = missions.map((mission) => ({
      mission,
      progress: progressByMissionId.get(mission.id) ?? null,
    }));
    const filtered = query?.status
      ? withProgress.filter(
          (item) => presentParentHeroProgressStatus(item.progress) === query.status,
        )
      : withProgress;

    return {
      child,
      missions: filtered.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: filtered.length,
    };
  }

  async listBadges(
    child: ParentAppAccessibleChild,
  ): Promise<ParentHeroBadgeReadModel[]> {
    return this.scopedPrisma.heroStudentBadge.findMany({
      where: {
        studentId: child.studentId,
        badge: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
        ...(child.termId
          ? {
              mission: {
                academicYearId: child.academicYearId,
                termId: child.termId,
                deletedAt: null,
              },
            }
          : {}),
      },
      orderBy: [{ earnedAt: 'desc' }, { badgeId: 'asc' }],
      ...PARENT_HERO_STUDENT_BADGE_ARGS,
    });
  }

  async findMission(params: {
    child: ParentAppAccessibleChild;
    missionId: string;
  }): Promise<ParentHeroMissionDetailReadModel | null> {
    if (!params.child.termId) return null;

    const enrollment = await this.findEnrollmentContext(params.child);
    const stageId = enrollment.classroom.section.grade.stage.id;
    const mission = await this.scopedPrisma.heroMission.findFirst({
      where: {
        id: params.missionId,
        academicYearId: params.child.academicYearId,
        termId: params.child.termId,
        stageId,
        status: HeroMissionStatus.PUBLISHED,
        deletedAt: null,
      },
      ...PARENT_HERO_MISSION_ARGS,
    });

    if (!mission) return null;

    const progress = await this.scopedPrisma.heroMissionProgress.findFirst({
      where: {
        missionId: mission.id,
        studentId: params.child.studentId,
        enrollmentId: params.child.enrollmentId,
      },
      ...PARENT_HERO_PROGRESS_ARGS,
    });

    return { child: params.child, mission, progress };
  }

  private findEnrollmentContext(
    child: ParentAppAccessibleChild,
  ): Promise<ParentHeroEnrollmentReadModel> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: child.enrollmentId,
        studentId: child.studentId,
        academicYearId: child.academicYearId,
      },
      ...PARENT_HERO_ENROLLMENT_ARGS,
    });
  }

  private listProgressForMissions(params: {
    child: ParentAppAccessibleChild;
    missionIds: string[];
  }): Promise<ParentHeroProgressReadModel[]> {
    if (params.missionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.heroMissionProgress.findMany({
      where: {
        missionId: { in: params.missionIds },
        studentId: params.child.studentId,
        enrollmentId: params.child.enrollmentId,
      },
      ...PARENT_HERO_PROGRESS_ARGS,
    });
  }

  private async sumCurrentXp(child: ParentAppAccessibleChild): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: buildParentHeroXpLedgerWhere(child),
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0;
  }

  private async getRewardsSummary(
    child: ParentAppAccessibleChild,
  ): Promise<ParentHeroRewardsSummaryReadModel> {
    const [heroXp, completedMissions, redemptionGroups] = await Promise.all([
      this.scopedPrisma.xpLedger.aggregate({
        where: {
          ...buildParentHeroXpLedgerWhere(child),
          sourceType: XpSourceType.HERO_MISSION,
        },
        _sum: { amount: true },
      }),
      this.scopedPrisma.heroMissionProgress.count({
        where: {
          studentId: child.studentId,
          enrollmentId: child.enrollmentId,
          academicYearId: child.academicYearId,
          ...(child.termId ? { termId: child.termId } : {}),
          status: HeroMissionProgressStatus.COMPLETED,
        },
      }),
      this.scopedPrisma.rewardRedemption.groupBy({
        by: ['status'],
        where: {
          studentId: child.studentId,
          enrollmentId: child.enrollmentId,
          academicYearId: child.academicYearId,
          ...(child.termId ? { termId: child.termId } : {}),
        },
        _count: { _all: true },
      }),
    ]);
    const redemptions = new Map(
      redemptionGroups.map((group) => [group.status, group._count._all]),
    );

    return {
      totalHeroXp: heroXp._sum.amount ?? 0,
      completedMissions,
      rewardRedemptions: {
        requested: redemptions.get(RewardRedemptionStatus.REQUESTED) ?? 0,
        approved: redemptions.get(RewardRedemptionStatus.APPROVED) ?? 0,
        fulfilled: redemptions.get(RewardRedemptionStatus.FULFILLED) ?? 0,
      },
    };
  }
}

export function presentParentHeroProgressStatus(
  progress: ParentHeroProgressReadModel | null,
): 'not_started' | 'in_progress' | 'completed' {
  if (!progress) return 'not_started';
  switch (progress.status) {
    case HeroMissionProgressStatus.COMPLETED:
      return 'completed';
    case HeroMissionProgressStatus.IN_PROGRESS:
      return 'in_progress';
    case HeroMissionProgressStatus.NOT_STARTED:
    case HeroMissionProgressStatus.CANCELLED:
      return 'not_started';
  }
}

function buildParentHeroXpLedgerWhere(
  child: ParentAppAccessibleChild,
): Prisma.XpLedgerWhereInput {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    academicYearId: child.academicYearId,
    ...(child.termId ? { termId: child.termId } : {}),
  };
}

function resolveLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || Number.isNaN(limit)) return defaultLimit;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
