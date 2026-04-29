import { Injectable } from '@nestjs/common';
import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  Prisma,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { XpScopeCandidate } from '../../xp/domain/reinforcement-xp-domain';

const HERO_REWARD_BADGE_SELECT = {
  id: true,
  schoolId: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  descriptionEn: true,
  descriptionAr: true,
  assetPath: true,
  fileId: true,
  isActive: true,
  deletedAt: true,
} satisfies Prisma.HeroBadgeSelect;

const HERO_REWARD_MISSION_SELECT = {
  id: true,
  schoolId: true,
  academicYearId: true,
  termId: true,
  stageId: true,
  titleEn: true,
  titleAr: true,
  rewardXp: true,
  badgeRewardId: true,
  status: true,
  archivedAt: true,
  deletedAt: true,
  badgeReward: {
    select: HERO_REWARD_BADGE_SELECT,
  },
} satisfies Prisma.HeroMissionSelect;

const HERO_REWARD_STUDENT_SELECT = {
  id: true,
  schoolId: true,
  firstName: true,
  lastName: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.StudentSelect;

const HERO_REWARD_ENROLLMENT_SELECT = {
  id: true,
  schoolId: true,
  studentId: true,
  academicYearId: true,
  termId: true,
  classroomId: true,
  status: true,
  deletedAt: true,
  classroom: {
    select: {
      id: true,
      sectionId: true,
      section: {
        select: {
          id: true,
          gradeId: true,
          grade: {
            select: {
              id: true,
              stageId: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EnrollmentSelect;

const HERO_REWARD_PROGRESS_ARGS =
  Prisma.validator<Prisma.HeroMissionProgressDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      missionId: true,
      studentId: true,
      enrollmentId: true,
      academicYearId: true,
      termId: true,
      status: true,
      progressPercent: true,
      startedAt: true,
      completedAt: true,
      lastActivityAt: true,
      xpLedgerId: true,
      createdAt: true,
      updatedAt: true,
      mission: {
        select: HERO_REWARD_MISSION_SELECT,
      },
      student: {
        select: HERO_REWARD_STUDENT_SELECT,
      },
      enrollment: {
        select: HERO_REWARD_ENROLLMENT_SELECT,
      },
    },
  });

const HERO_REWARD_XP_LEDGER_ARGS =
  Prisma.validator<Prisma.XpLedgerDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      assignmentId: true,
      policyId: true,
      sourceType: true,
      sourceId: true,
      amount: true,
      reason: true,
      reasonAr: true,
      actorUserId: true,
      occurredAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const HERO_REWARD_XP_POLICY_ARGS =
  Prisma.validator<Prisma.XpPolicyDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      scopeType: true,
      scopeKey: true,
      dailyCap: true,
      weeklyCap: true,
      cooldownMinutes: true,
      allowedReasons: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

const HERO_STUDENT_BADGE_ARGS =
  Prisma.validator<Prisma.HeroStudentBadgeDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      badgeId: true,
      missionId: true,
      missionProgressId: true,
      earnedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      badge: {
        select: HERO_REWARD_BADGE_SELECT,
      },
    },
  });

const HERO_REWARD_EVENT_ARGS =
  Prisma.validator<Prisma.HeroJourneyEventDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      missionId: true,
      missionProgressId: true,
      objectiveId: true,
      studentId: true,
      enrollmentId: true,
      xpLedgerId: true,
      badgeId: true,
      type: true,
      sourceId: true,
      actorUserId: true,
      occurredAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type HeroRewardBadgeRecord = Prisma.HeroBadgeGetPayload<{
  select: typeof HERO_REWARD_BADGE_SELECT;
}>;
export type HeroRewardMissionRecord = Prisma.HeroMissionGetPayload<{
  select: typeof HERO_REWARD_MISSION_SELECT;
}>;
export type HeroRewardProgressRecord = Prisma.HeroMissionProgressGetPayload<
  typeof HERO_REWARD_PROGRESS_ARGS
>;
export type HeroRewardStudentRecord = Prisma.StudentGetPayload<{
  select: typeof HERO_REWARD_STUDENT_SELECT;
}>;
export type HeroRewardEnrollmentRecord = Prisma.EnrollmentGetPayload<{
  select: typeof HERO_REWARD_ENROLLMENT_SELECT;
}>;
export type HeroRewardXpLedgerRecord = Prisma.XpLedgerGetPayload<
  typeof HERO_REWARD_XP_LEDGER_ARGS
>;
export type HeroRewardXpPolicyRecord = Prisma.XpPolicyGetPayload<
  typeof HERO_REWARD_XP_POLICY_ARGS
>;
export type HeroStudentBadgeRecord = Prisma.HeroStudentBadgeGetPayload<
  typeof HERO_STUDENT_BADGE_ARGS
>;
export type HeroRewardEventRecord = Prisma.HeroJourneyEventGetPayload<
  typeof HERO_REWARD_EVENT_ARGS
>;

export interface StudentHeroRewardsRecord {
  xpLedger: HeroRewardXpLedgerRecord[];
  badges: HeroStudentBadgeRecord[];
  allStudentBadges: HeroStudentBadgeRecord[];
  completedProgress: HeroRewardProgressRecord[];
  events: HeroRewardEventRecord[];
}

@Injectable()
export class HeroJourneyRewardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findStudent(studentId: string): Promise<HeroRewardStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId, status: StudentStatus.ACTIVE },
      select: HERO_REWARD_STUDENT_SELECT,
    });
  }

  findProgressForReward(
    progressId: string,
  ): Promise<HeroRewardProgressRecord | null> {
    return this.scopedPrisma.heroMissionProgress.findFirst({
      where: { id: progressId },
      ...HERO_REWARD_PROGRESS_ARGS,
    });
  }

  findExistingHeroXpLedger(params: {
    progressId: string;
    studentId: string;
  }): Promise<HeroRewardXpLedgerRecord | null> {
    return this.scopedPrisma.xpLedger.findFirst({
      where: {
        sourceType: XpSourceType.HERO_MISSION,
        sourceId: params.progressId,
        studentId: params.studentId,
      },
      ...HERO_REWARD_XP_LEDGER_ARGS,
    });
  }

  findEffectiveXpPolicyCandidates(params: {
    academicYearId: string;
    termId: string;
    candidates: XpScopeCandidate[];
    now: Date;
  }): Promise<HeroRewardXpPolicyRecord[]> {
    return this.scopedPrisma.xpPolicy.findMany({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        isActive: true,
        OR: params.candidates.map((candidate) => ({
          scopeType: candidate.scopeType,
          scopeKey: candidate.scopeKey,
        })),
        AND: [
          {
            OR: [{ startsAt: null }, { startsAt: { lte: params.now } }],
          },
          {
            OR: [{ endsAt: null }, { endsAt: { gte: params.now } }],
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      ...HERO_REWARD_XP_POLICY_ARGS,
    });
  }

  async sumXpForPeriod(params: {
    academicYearId: string;
    termId: string;
    studentId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        occurredAt: {
          gte: params.from,
          lt: params.to,
        },
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0;
  }

  findLatestXpForCooldown(params: {
    academicYearId: string;
    termId: string;
    studentId: string;
    beforeOrAt: Date;
  }): Promise<{ occurredAt: Date } | null> {
    return this.scopedPrisma.xpLedger.findFirst({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        occurredAt: { lte: params.beforeOrAt },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      select: { occurredAt: true },
    });
  }

  async createHeroXpLedgerAndEvent(params: {
    schoolId: string;
    progressId: string;
    ledger: Prisma.XpLedgerUncheckedCreateInput;
    event: Prisma.HeroJourneyEventUncheckedCreateInput;
  }): Promise<HeroRewardXpLedgerRecord> {
    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.xpLedger.create({
        data: {
          ...params.ledger,
          metadata: this.toNullableJson(params.ledger.metadata),
        },
        ...HERO_REWARD_XP_LEDGER_ARGS,
      });

      await tx.heroMissionProgress.updateMany({
        where: {
          schoolId: params.schoolId,
          id: params.progressId,
          xpLedgerId: null,
        },
        data: {
          xpLedgerId: ledger.id,
          lastActivityAt: params.ledger.occurredAt as Date,
        },
      });

      await tx.heroJourneyEvent.create({
        data: {
          ...params.event,
          xpLedgerId: ledger.id,
          metadata: this.toNullableJson(params.event.metadata),
        },
      });

      return ledger;
    });
  }

  findExistingStudentBadge(params: {
    studentId: string;
    badgeId: string;
  }): Promise<HeroStudentBadgeRecord | null> {
    return this.scopedPrisma.heroStudentBadge.findFirst({
      where: {
        studentId: params.studentId,
        badgeId: params.badgeId,
      },
      ...HERO_STUDENT_BADGE_ARGS,
    });
  }

  async createHeroStudentBadgeAndEvent(params: {
    schoolId: string;
    studentBadge: Prisma.HeroStudentBadgeUncheckedCreateInput;
    event: Prisma.HeroJourneyEventUncheckedCreateInput;
  }): Promise<HeroStudentBadgeRecord> {
    return this.prisma.$transaction(async (tx) => {
      const studentBadge = await tx.heroStudentBadge.create({
        data: {
          ...params.studentBadge,
          metadata: this.toNullableJson(params.studentBadge.metadata),
        },
        ...HERO_STUDENT_BADGE_ARGS,
      });

      await tx.heroJourneyEvent.create({
        data: {
          ...params.event,
          sourceId: studentBadge.id,
          metadata: this.toNullableJson(params.event.metadata),
        },
      });

      return studentBadge;
    });
  }

  async getStudentHeroRewards(params: {
    studentId: string;
    academicYearId?: string;
    termId?: string;
    includeEvents?: boolean;
  }): Promise<StudentHeroRewardsRecord> {
    const [xpLedger, badges, allStudentBadges, completedProgress, events] =
      await Promise.all([
        this.listHeroMissionXpLedger(params),
        this.listStudentBadges(params),
        this.listAllStudentBadges(params.studentId),
        this.listCompletedRewardProgress(params),
        params.includeEvents
          ? this.listRewardEvents(params)
          : Promise.resolve([]),
      ]);

    return {
      xpLedger,
      badges,
      allStudentBadges,
      completedProgress,
      events,
    };
  }

  private listHeroMissionXpLedger(params: {
    studentId: string;
    academicYearId?: string;
    termId?: string;
  }): Promise<HeroRewardXpLedgerRecord[]> {
    return this.scopedPrisma.xpLedger.findMany({
      where: {
        studentId: params.studentId,
        sourceType: XpSourceType.HERO_MISSION,
        ...(params.academicYearId
          ? { academicYearId: params.academicYearId }
          : {}),
        ...(params.termId ? { termId: params.termId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      ...HERO_REWARD_XP_LEDGER_ARGS,
    });
  }

  private listStudentBadges(params: {
    studentId: string;
    academicYearId?: string;
    termId?: string;
  }): Promise<HeroStudentBadgeRecord[]> {
    return this.scopedPrisma.heroStudentBadge.findMany({
      where: {
        studentId: params.studentId,
        ...this.buildMissionFilter(params),
      },
      orderBy: [{ earnedAt: 'desc' }, { id: 'asc' }],
      ...HERO_STUDENT_BADGE_ARGS,
    });
  }

  private listAllStudentBadges(
    studentId: string,
  ): Promise<HeroStudentBadgeRecord[]> {
    return this.scopedPrisma.heroStudentBadge.findMany({
      where: { studentId },
      orderBy: [{ earnedAt: 'desc' }, { id: 'asc' }],
      ...HERO_STUDENT_BADGE_ARGS,
    });
  }

  private listCompletedRewardProgress(params: {
    studentId: string;
    academicYearId?: string;
    termId?: string;
  }): Promise<HeroRewardProgressRecord[]> {
    return this.scopedPrisma.heroMissionProgress.findMany({
      where: {
        studentId: params.studentId,
        status: HeroMissionProgressStatus.COMPLETED,
        ...(params.academicYearId
          ? { academicYearId: params.academicYearId }
          : {}),
        ...(params.termId ? { termId: params.termId } : {}),
        mission: { deletedAt: null },
      },
      orderBy: [
        { completedAt: 'desc' },
        { lastActivityAt: 'desc' },
        { id: 'asc' },
      ],
      ...HERO_REWARD_PROGRESS_ARGS,
    });
  }

  private listRewardEvents(params: {
    studentId: string;
    academicYearId?: string;
    termId?: string;
  }): Promise<HeroRewardEventRecord[]> {
    return this.scopedPrisma.heroJourneyEvent.findMany({
      where: {
        studentId: params.studentId,
        type: {
          in: [
            HeroJourneyEventType.XP_GRANTED,
            HeroJourneyEventType.BADGE_AWARDED,
          ],
        },
        mission: {
          deletedAt: null,
          ...(params.academicYearId
            ? { academicYearId: params.academicYearId }
            : {}),
          ...(params.termId ? { termId: params.termId } : {}),
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 20,
      ...HERO_REWARD_EVENT_ARGS,
    });
  }

  private buildMissionFilter(params: {
    academicYearId?: string;
    termId?: string;
  }): Prisma.HeroStudentBadgeWhereInput {
    if (!params.academicYearId && !params.termId) return {};

    return {
      mission: {
        deletedAt: null,
        ...(params.academicYearId
          ? { academicYearId: params.academicYearId }
          : {}),
        ...(params.termId ? { termId: params.termId } : {}),
      },
    };
  }

  private toNullableJson(
    value: unknown,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
