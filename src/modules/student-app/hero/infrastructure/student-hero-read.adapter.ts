import { Injectable } from '@nestjs/common';
import {
  HeroMissionProgressStatus,
  HeroMissionStatus,
  Prisma,
  RewardRedemptionStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import type { StudentHeroMissionsQueryDto } from '../dto/student-hero.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const STUDENT_HERO_ENROLLMENT_ARGS =
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
                      nameEn: true,
                      nameAr: true,
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

const STUDENT_HERO_BADGE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  descriptionEn: true,
  descriptionAr: true,
} satisfies Prisma.HeroBadgeSelect;

const STUDENT_HERO_OBJECTIVE_SELECT = {
  id: true,
  type: true,
  titleEn: true,
  titleAr: true,
  subtitleEn: true,
  subtitleAr: true,
  sortOrder: true,
  isRequired: true,
} satisfies Prisma.HeroMissionObjectiveSelect;

const STUDENT_HERO_MISSION_ARGS =
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
        select: STUDENT_HERO_BADGE_SUMMARY_SELECT,
      },
      objectives: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: STUDENT_HERO_OBJECTIVE_SELECT,
      },
    },
  });

const STUDENT_HERO_PROGRESS_ARGS =
  Prisma.validator<Prisma.HeroMissionProgressDefaultArgs>()({
    select: {
      id: true,
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

const STUDENT_HERO_STUDENT_BADGE_ARGS =
  Prisma.validator<Prisma.HeroStudentBadgeDefaultArgs>()({
    select: {
      id: true,
      badgeId: true,
      missionId: true,
      earnedAt: true,
      badge: {
        select: STUDENT_HERO_BADGE_SUMMARY_SELECT,
      },
    },
  });

export type StudentHeroEnrollmentReadModel = Prisma.EnrollmentGetPayload<
  typeof STUDENT_HERO_ENROLLMENT_ARGS
>;
export type StudentHeroMissionReadModel = Prisma.HeroMissionGetPayload<
  typeof STUDENT_HERO_MISSION_ARGS
>;
export type StudentHeroProgressReadModel = Prisma.HeroMissionProgressGetPayload<
  typeof STUDENT_HERO_PROGRESS_ARGS
>;
export type StudentHeroBadgeReadModel = Prisma.HeroStudentBadgeGetPayload<
  typeof STUDENT_HERO_STUDENT_BADGE_ARGS
>;

export interface StudentHeroMissionWithProgressReadModel {
  mission: StudentHeroMissionReadModel;
  progress: StudentHeroProgressReadModel | null;
}

export interface StudentHeroMissionsReadModel {
  missions: StudentHeroMissionWithProgressReadModel[];
  page: number;
  limit: number;
  total: number;
}

export interface StudentHeroProgressSummaryReadModel {
  missions: StudentHeroMissionWithProgressReadModel[];
}

export interface StudentHeroRewardsSummaryReadModel {
  totalHeroXp: number;
  completedMissions: number;
  rewardRedemptions: {
    requested: number;
    approved: number;
    fulfilled: number;
  };
}

export interface StudentHeroOverviewReadModel {
  currentXp: number;
  badges: StudentHeroBadgeReadModel[];
  missions: StudentHeroMissionWithProgressReadModel[];
  rewardsSummary: StudentHeroRewardsSummaryReadModel;
}

export interface StudentHeroMissionDetailReadModel {
  mission: StudentHeroMissionReadModel;
  progress: StudentHeroProgressReadModel | null;
}

@Injectable()
export class StudentHeroReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getHeroOverview(
    context: StudentAppContext,
  ): Promise<StudentHeroOverviewReadModel> {
    const [currentXp, badges, progress, rewardsSummary] = await Promise.all([
      this.sumCurrentXp(context),
      this.listBadges(context),
      this.getHeroProgress(context),
      this.getRewardsSummary(context),
    ]);

    return {
      currentXp,
      badges,
      missions: progress.missions,
      rewardsSummary,
    };
  }

  async getHeroProgress(
    context: StudentAppContext,
  ): Promise<StudentHeroProgressSummaryReadModel> {
    const result = await this.listMissions(context, { limit: MAX_LIMIT });
    return { missions: result.missions };
  }

  async listMissions(
    context: StudentAppContext,
    query?: StudentHeroMissionsQueryDto,
  ): Promise<StudentHeroMissionsReadModel> {
    const page = resolvePage(query?.page);
    const limit = resolveLimit(query?.limit, DEFAULT_LIMIT);

    if (!context.termId) {
      return { missions: [], page, limit, total: 0 };
    }

    const enrollment = await this.findEnrollmentContext(context);
    const stageId = enrollment.classroom.section.grade.stage.id;
    const missions = await this.scopedPrisma.heroMission.findMany({
      where: {
        academicYearId: context.academicYearId,
        termId: context.termId,
        stageId,
        status: HeroMissionStatus.PUBLISHED,
        ...(query?.subjectId ? { subjectId: query.subjectId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...STUDENT_HERO_MISSION_ARGS,
    });
    const progress = await this.listProgressForMissions({
      context,
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
          (item) => presentProgressStatus(item.progress) === query.status,
        )
      : withProgress;

    return {
      missions: filtered.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: filtered.length,
    };
  }

  async listBadges(
    context: StudentAppContext,
  ): Promise<StudentHeroBadgeReadModel[]> {
    return this.scopedPrisma.heroStudentBadge.findMany({
      where: {
        studentId: context.studentId,
        ...(context.termId
          ? {
              mission: {
                academicYearId: context.academicYearId,
                termId: context.termId,
                deletedAt: null,
              },
            }
          : {}),
      },
      orderBy: [{ earnedAt: 'desc' }, { id: 'asc' }],
      ...STUDENT_HERO_STUDENT_BADGE_ARGS,
    });
  }

  async findMission(params: {
    context: StudentAppContext;
    missionId: string;
  }): Promise<StudentHeroMissionDetailReadModel | null> {
    if (!params.context.termId) return null;

    const enrollment = await this.findEnrollmentContext(params.context);
    const stageId = enrollment.classroom.section.grade.stage.id;
    const mission = await this.scopedPrisma.heroMission.findFirst({
      where: {
        id: params.missionId,
        academicYearId: params.context.academicYearId,
        termId: params.context.termId,
        stageId,
        status: HeroMissionStatus.PUBLISHED,
      },
      ...STUDENT_HERO_MISSION_ARGS,
    });

    if (!mission) return null;

    const progress = await this.scopedPrisma.heroMissionProgress.findFirst({
      where: {
        missionId: mission.id,
        studentId: params.context.studentId,
        enrollmentId: params.context.enrollmentId,
      },
      ...STUDENT_HERO_PROGRESS_ARGS,
    });

    return { mission, progress };
  }

  private findEnrollmentContext(
    context: StudentAppContext,
  ): Promise<StudentHeroEnrollmentReadModel> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_HERO_ENROLLMENT_ARGS,
    });
  }

  private listProgressForMissions(params: {
    context: StudentAppContext;
    missionIds: string[];
  }): Promise<StudentHeroProgressReadModel[]> {
    if (params.missionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.heroMissionProgress.findMany({
      where: {
        missionId: { in: params.missionIds },
        studentId: params.context.studentId,
        enrollmentId: params.context.enrollmentId,
      },
      ...STUDENT_HERO_PROGRESS_ARGS,
    });
  }

  private async sumCurrentXp(context: StudentAppContext): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        studentId: context.studentId,
        academicYearId: context.academicYearId,
        ...(context.termId ? { termId: context.termId } : {}),
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0;
  }

  private async getRewardsSummary(
    context: StudentAppContext,
  ): Promise<StudentHeroRewardsSummaryReadModel> {
    const [heroXp, completedMissions, redemptionGroups] = await Promise.all([
      this.scopedPrisma.xpLedger.aggregate({
        where: {
          studentId: context.studentId,
          academicYearId: context.academicYearId,
          ...(context.termId ? { termId: context.termId } : {}),
          sourceType: XpSourceType.HERO_MISSION,
        },
        _sum: { amount: true },
      }),
      this.scopedPrisma.heroMissionProgress.count({
        where: {
          studentId: context.studentId,
          academicYearId: context.academicYearId,
          ...(context.termId ? { termId: context.termId } : {}),
          status: HeroMissionProgressStatus.COMPLETED,
        },
      }),
      this.scopedPrisma.rewardRedemption.groupBy({
        by: ['status'],
        where: {
          studentId: context.studentId,
          academicYearId: context.academicYearId,
          ...(context.termId ? { termId: context.termId } : {}),
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

export function presentProgressStatus(
  progress: StudentHeroProgressReadModel | null,
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

function resolveLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || Number.isNaN(limit)) return defaultLimit;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
