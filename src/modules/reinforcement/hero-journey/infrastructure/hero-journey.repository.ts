import { Injectable } from '@nestjs/common';
import {
  HeroMissionStatus,
  Prisma,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NormalizedHeroMissionObjective } from '../domain/hero-journey-domain';

const HERO_BADGE_SELECT = {
  id: true,
  schoolId: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  descriptionEn: true,
  descriptionAr: true,
  assetPath: true,
  fileId: true,
  sortOrder: true,
  isActive: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.HeroBadgeSelect;

const HERO_BADGE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  assetPath: true,
  fileId: true,
  isActive: true,
} satisfies Prisma.HeroBadgeSelect;

const HERO_OBJECTIVE_SELECT = {
  id: true,
  schoolId: true,
  missionId: true,
  type: true,
  titleEn: true,
  titleAr: true,
  subtitleEn: true,
  subtitleAr: true,
  linkedAssessmentId: true,
  linkedLessonRef: true,
  sortOrder: true,
  isRequired: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.HeroMissionObjectiveSelect;

const HERO_MISSION_ARGS = Prisma.validator<Prisma.HeroMissionDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    termId: true,
    stageId: true,
    subjectId: true,
    linkedAssessmentId: true,
    linkedLessonRef: true,
    titleEn: true,
    titleAr: true,
    briefEn: true,
    briefAr: true,
    requiredLevel: true,
    rewardXp: true,
    badgeRewardId: true,
    status: true,
    positionX: true,
    positionY: true,
    sortOrder: true,
    publishedAt: true,
    publishedById: true,
    archivedAt: true,
    archivedById: true,
    createdById: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    badgeReward: {
      select: HERO_BADGE_SUMMARY_SELECT,
    },
    objectives: {
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: HERO_OBJECTIVE_SELECT,
    },
  },
});

const ACADEMIC_YEAR_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.AcademicYearSelect;

const TERM_SELECT = {
  id: true,
  academicYearId: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.TermSelect;

const STAGE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.StageSelect;

const SUBJECT_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  code: true,
  isActive: true,
} satisfies Prisma.SubjectSelect;

const ASSESSMENT_SELECT = {
  id: true,
  academicYearId: true,
  termId: true,
  subjectId: true,
  stageId: true,
  gradeId: true,
  sectionId: true,
  classroomId: true,
  approvalStatus: true,
} satisfies Prisma.GradeAssessmentSelect;

const FILE_SELECT = {
  id: true,
  schoolId: true,
  organizationId: true,
  originalName: true,
} satisfies Prisma.FileSelect;

export type HeroBadgeRecord = Prisma.HeroBadgeGetPayload<{
  select: typeof HERO_BADGE_SELECT;
}>;
export type HeroMissionRecord = Prisma.HeroMissionGetPayload<
  typeof HERO_MISSION_ARGS
>;
export type HeroMissionObjectiveRecord = HeroMissionRecord['objectives'][number];
export type HeroAcademicYearRecord = Prisma.AcademicYearGetPayload<{
  select: typeof ACADEMIC_YEAR_SELECT;
}>;
export type HeroTermRecord = Prisma.TermGetPayload<{
  select: typeof TERM_SELECT;
}>;
export type HeroStageRecord = Prisma.StageGetPayload<{
  select: typeof STAGE_SELECT;
}>;
export type HeroSubjectRecord = Prisma.SubjectGetPayload<{
  select: typeof SUBJECT_SELECT;
}>;
export type HeroAssessmentRecord = Prisma.GradeAssessmentGetPayload<{
  select: typeof ASSESSMENT_SELECT;
}>;
export type HeroFileRecord = Prisma.FileGetPayload<{
  select: typeof FILE_SELECT;
}>;

export interface ListHeroBadgesFilters {
  search?: string;
  isActive?: boolean;
  includeDeleted?: boolean;
}

export interface ListHeroMissionsFilters {
  academicYearId?: string;
  termId?: string;
  stageId?: string;
  subjectId?: string;
  status?: HeroMissionStatus;
  search?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateHeroMissionWithObjectivesInput {
  schoolId: string;
  mission: Omit<
    Prisma.HeroMissionUncheckedCreateInput,
    'schoolId' | 'objectives'
  >;
  objectives: NormalizedHeroMissionObjective[];
}

export interface UpdateHeroMissionWithObjectivesInput {
  schoolId: string;
  missionId: string;
  mission: Prisma.HeroMissionUncheckedUpdateManyInput;
  objectives?: NormalizedHeroMissionObjective[];
}

@Injectable()
export class HeroJourneyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listBadges(filters: ListHeroBadgesFilters): Promise<HeroBadgeRecord[]> {
    const query = () =>
      this.scopedPrisma.heroBadge.findMany({
        where: this.buildBadgeListWhere(filters),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HERO_BADGE_SELECT,
      });

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  findBadgeById(
    badgeId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<HeroBadgeRecord | null> {
    const query = () =>
      this.scopedPrisma.heroBadge.findFirst({
        where: { id: badgeId },
        select: HERO_BADGE_SELECT,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  createBadge(
    data: Prisma.HeroBadgeUncheckedCreateInput,
  ): Promise<HeroBadgeRecord> {
    return this.scopedPrisma.heroBadge.create({
      data,
      select: HERO_BADGE_SELECT,
    });
  }

  async updateBadge(
    badgeId: string,
    data: Prisma.HeroBadgeUncheckedUpdateManyInput,
  ): Promise<HeroBadgeRecord> {
    await this.scopedPrisma.heroBadge.updateMany({
      where: { id: badgeId },
      data,
    });

    return this.findBadgeMutationResult(badgeId);
  }

  async softDeleteBadge(badgeId: string): Promise<HeroBadgeRecord> {
    const deletedAt = new Date();
    await this.scopedPrisma.heroBadge.updateMany({
      where: { id: badgeId },
      data: { deletedAt },
    });

    return this.findBadgeMutationResult(badgeId, { includeDeleted: true });
  }

  countActiveMissionsUsingBadge(badgeId: string): Promise<number> {
    return this.scopedPrisma.heroMission.count({
      where: {
        badgeRewardId: badgeId,
        status: { not: HeroMissionStatus.ARCHIVED },
      },
    });
  }

  async listMissions(filters: ListHeroMissionsFilters): Promise<{
    items: HeroMissionRecord[];
    total: number;
  }> {
    const where = this.buildMissionListWhere(filters);
    const query = async () => {
      const [items, total] = await Promise.all([
        this.scopedPrisma.heroMission.findMany({
          where,
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'desc' },
            { id: 'asc' },
          ],
          ...(filters.limit !== undefined ? { take: filters.limit } : {}),
          ...(filters.offset !== undefined ? { skip: filters.offset } : {}),
          ...HERO_MISSION_ARGS,
        }),
        this.scopedPrisma.heroMission.count({ where }),
      ]);

      return { items, total };
    };

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  findMissionById(
    missionId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<HeroMissionRecord | null> {
    const query = () =>
      this.scopedPrisma.heroMission.findFirst({
        where: { id: missionId },
        ...HERO_MISSION_ARGS,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  async createMissionWithObjectives(
    input: CreateHeroMissionWithObjectivesInput,
  ): Promise<HeroMissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const mission = await tx.heroMission.create({
        data: {
          ...input.mission,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });

      await this.createMissionObjectives(tx, {
        schoolId: input.schoolId,
        missionId: mission.id,
        objectives: input.objectives,
      });

      return this.findMissionInTransaction(tx, input.schoolId, mission.id);
    });
  }

  async updateMissionWithObjectives(
    input: UpdateHeroMissionWithObjectivesInput,
  ): Promise<HeroMissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(input.mission).length > 0) {
        await tx.heroMission.updateMany({
          where: {
            id: input.missionId,
            schoolId: input.schoolId,
            deletedAt: null,
          },
          data: input.mission,
        });
      }

      if (input.objectives) {
        await this.replaceMissionObjectives(tx, {
          schoolId: input.schoolId,
          missionId: input.missionId,
          objectives: input.objectives,
        });
      }

      return this.findMissionInTransaction(
        tx,
        input.schoolId,
        input.missionId,
      );
    });
  }

  async publishMission(params: {
    schoolId: string;
    missionId: string;
    actorId: string;
  }): Promise<HeroMissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.heroMission.updateMany({
        where: {
          id: params.missionId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: {
          status: HeroMissionStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedById: params.actorId,
        },
      });

      return this.findMissionInTransaction(
        tx,
        params.schoolId,
        params.missionId,
      );
    });
  }

  async archiveMission(params: {
    schoolId: string;
    missionId: string;
    actorId: string;
  }): Promise<HeroMissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.heroMission.updateMany({
        where: {
          id: params.missionId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: {
          status: HeroMissionStatus.ARCHIVED,
          archivedAt: new Date(),
          archivedById: params.actorId,
        },
      });

      return this.findMissionInTransaction(
        tx,
        params.schoolId,
        params.missionId,
      );
    });
  }

  async softDeleteMissionAndObjectives(params: {
    schoolId: string;
    missionId: string;
  }): Promise<HeroMissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.heroMissionObjective.updateMany({
        where: {
          schoolId: params.schoolId,
          missionId: params.missionId,
          deletedAt: null,
        },
        data: { deletedAt },
      });
      await tx.heroMission.updateMany({
        where: {
          id: params.missionId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: { deletedAt },
      });

      const mission = await tx.heroMission.findFirst({
        where: {
          id: params.missionId,
          schoolId: params.schoolId,
        },
        ...HERO_MISSION_ARGS,
      });
      if (!mission) {
        throw new Error('Deleted Hero mission was not found');
      }

      return mission;
    });
  }

  countMissionProgress(missionId: string): Promise<number> {
    return this.scopedPrisma.heroMissionProgress.count({
      where: { missionId },
    });
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<HeroAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: ACADEMIC_YEAR_SELECT,
    });
  }

  findTerm(termId: string): Promise<HeroTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      select: TERM_SELECT,
    });
  }

  findStage(stageId: string): Promise<HeroStageRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      select: STAGE_SELECT,
    });
  }

  findSubject(subjectId: string): Promise<HeroSubjectRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      select: SUBJECT_SELECT,
    });
  }

  findAssessment(
    assessmentId: string,
  ): Promise<HeroAssessmentRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: { id: assessmentId },
      select: ASSESSMENT_SELECT,
    });
  }

  findFile(fileId: string): Promise<HeroFileRecord | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      select: FILE_SELECT,
    });
  }

  private buildBadgeListWhere(
    filters: ListHeroBadgesFilters,
  ): Prisma.HeroBadgeWhereInput {
    const search = filters.search?.trim();
    const and: Prisma.HeroBadgeWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { slug: { contains: search, mode: 'insensitive' } },
          { nameEn: { contains: search, mode: 'insensitive' } },
          { nameAr: { contains: search, mode: 'insensitive' } },
          { descriptionEn: { contains: search, mode: 'insensitive' } },
          { descriptionAr: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildMissionListWhere(
    filters: ListHeroMissionsFilters,
  ): Prisma.HeroMissionWhereInput {
    const and: Prisma.HeroMissionWhereInput[] = [];
    const search = filters.search?.trim();

    if (!filters.status && !filters.includeArchived) {
      and.push({ status: { not: HeroMissionStatus.ARCHIVED } });
    }

    if (search) {
      const searchOr: Prisma.HeroMissionWhereInput[] = [
        { titleEn: { contains: search, mode: 'insensitive' } },
        { titleAr: { contains: search, mode: 'insensitive' } },
        { briefEn: { contains: search, mode: 'insensitive' } },
        { briefAr: { contains: search, mode: 'insensitive' } },
        { badgeReward: { slug: { contains: search, mode: 'insensitive' } } },
      ];

      if (isUuid(search)) searchOr.unshift({ id: search });
      and.push({ OR: searchOr });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async findBadgeMutationResult(
    badgeId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<HeroBadgeRecord> {
    const badge = await this.findBadgeById(badgeId, options);
    if (!badge) {
      throw new Error('Updated Hero badge was not found');
    }

    return badge;
  }

  private async createMissionObjectives(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      missionId: string;
      objectives: NormalizedHeroMissionObjective[];
    },
  ): Promise<void> {
    if (params.objectives.length === 0) return;

    await tx.heroMissionObjective.createMany({
      data: params.objectives.map((objective) => ({
        schoolId: params.schoolId,
        missionId: params.missionId,
        type: objective.type,
        titleEn: objective.titleEn,
        titleAr: objective.titleAr,
        subtitleEn: objective.subtitleEn,
        subtitleAr: objective.subtitleAr,
        linkedAssessmentId: objective.linkedAssessmentId,
        linkedLessonRef: objective.linkedLessonRef,
        sortOrder: objective.sortOrder,
        isRequired: objective.isRequired,
        metadata: this.toNullableJson(objective.metadata),
      })),
    });
  }

  private async replaceMissionObjectives(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      missionId: string;
      objectives: NormalizedHeroMissionObjective[];
    },
  ): Promise<void> {
    const activeObjectives = await tx.heroMissionObjective.findMany({
      where: {
        schoolId: params.schoolId,
        missionId: params.missionId,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    const maxSortOrder = await tx.heroMissionObjective.aggregate({
      where: {
        schoolId: params.schoolId,
        missionId: params.missionId,
      },
      _max: { sortOrder: true },
    });

    const deletedAt = new Date();
    const offset = (maxSortOrder._max.sortOrder ?? 0) + 1;
    await Promise.all(
      activeObjectives.map((objective, index) =>
        tx.heroMissionObjective.update({
          where: { id: objective.id },
          data: {
            deletedAt,
            sortOrder: offset + index,
          },
        }),
      ),
    );

    await this.createMissionObjectives(tx, params);
  }

  private async findMissionInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    missionId: string,
  ): Promise<HeroMissionRecord> {
    const mission = await tx.heroMission.findFirst({
      where: {
        id: missionId,
        schoolId,
        deletedAt: null,
      },
      ...HERO_MISSION_ARGS,
    });

    if (!mission) {
      throw new Error('Hero mission mutation result was not found');
    }

    return mission;
  }

  private toNullableJson(
    value: unknown,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}
