import { Injectable } from '@nestjs/common';
import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const HERO_PROGRESS_BADGE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  assetPath: true,
  fileId: true,
  isActive: true,
} satisfies Prisma.HeroBadgeSelect;

const HERO_PROGRESS_OBJECTIVE_SELECT = {
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

const HERO_PROGRESS_MISSION_SELECT = {
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
    select: HERO_PROGRESS_BADGE_SUMMARY_SELECT,
  },
  objectives: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: HERO_PROGRESS_OBJECTIVE_SELECT,
  },
} satisfies Prisma.HeroMissionSelect;

const HERO_PROGRESS_STUDENT_SELECT = {
  id: true,
  schoolId: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const HERO_PROGRESS_ENROLLMENT_SELECT = {
  id: true,
  schoolId: true,
  studentId: true,
  academicYearId: true,
  termId: true,
  classroomId: true,
  status: true,
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
} satisfies Prisma.EnrollmentSelect;

const HERO_OBJECTIVE_PROGRESS_SELECT = {
  id: true,
  schoolId: true,
  missionProgressId: true,
  objectiveId: true,
  completedAt: true,
  completedById: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HeroMissionObjectiveProgressSelect;

const HERO_EVENT_SELECT = {
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
} satisfies Prisma.HeroJourneyEventSelect;

const HERO_PROGRESS_DETAIL_ARGS =
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
      metadata: true,
      createdAt: true,
      updatedAt: true,
      mission: {
        select: HERO_PROGRESS_MISSION_SELECT,
      },
      student: {
        select: HERO_PROGRESS_STUDENT_SELECT,
      },
      enrollment: {
        select: HERO_PROGRESS_ENROLLMENT_SELECT,
      },
      objectiveProgress: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: HERO_OBJECTIVE_PROGRESS_SELECT,
      },
      events: {
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        select: HERO_EVENT_SELECT,
      },
    },
  });

const HERO_ACADEMIC_YEAR_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
  startDate: true,
} satisfies Prisma.AcademicYearSelect;

const HERO_TERM_SELECT = {
  id: true,
  academicYearId: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
  startDate: true,
} satisfies Prisma.TermSelect;

export type HeroProgressBadgeSummaryRecord = Prisma.HeroBadgeGetPayload<{
  select: typeof HERO_PROGRESS_BADGE_SUMMARY_SELECT;
}>;
export type HeroProgressObjectiveRecord =
  Prisma.HeroMissionObjectiveGetPayload<{
    select: typeof HERO_PROGRESS_OBJECTIVE_SELECT;
  }>;
export type HeroProgressMissionRecord = Prisma.HeroMissionGetPayload<{
  select: typeof HERO_PROGRESS_MISSION_SELECT;
}>;
export type HeroProgressStudentRecord = Prisma.StudentGetPayload<{
  select: typeof HERO_PROGRESS_STUDENT_SELECT;
}>;
export type HeroProgressEnrollmentRecord = Prisma.EnrollmentGetPayload<{
  select: typeof HERO_PROGRESS_ENROLLMENT_SELECT;
}>;
export type HeroObjectiveProgressRecord =
  Prisma.HeroMissionObjectiveProgressGetPayload<{
    select: typeof HERO_OBJECTIVE_PROGRESS_SELECT;
  }>;
export type HeroJourneyEventRecord = Prisma.HeroJourneyEventGetPayload<{
  select: typeof HERO_EVENT_SELECT;
}>;
export type HeroProgressDetailRecord = Prisma.HeroMissionProgressGetPayload<
  typeof HERO_PROGRESS_DETAIL_ARGS
>;
export type HeroProgressAcademicYearRecord = Prisma.AcademicYearGetPayload<{
  select: typeof HERO_ACADEMIC_YEAR_SELECT;
}>;
export type HeroProgressTermRecord = Prisma.TermGetPayload<{
  select: typeof HERO_TERM_SELECT;
}>;

export interface ListStudentHeroProgressFilters {
  studentId: string;
  academicYearId: string;
  termId: string;
  stageId: string;
  status?: HeroMissionProgressStatus;
  includeArchived?: boolean;
}

@Injectable()
export class HeroJourneyProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<HeroProgressAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: HERO_ACADEMIC_YEAR_SELECT,
    });
  }

  findActiveAcademicYear(): Promise<HeroProgressAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      select: HERO_ACADEMIC_YEAR_SELECT,
    });
  }

  findTerm(termId: string): Promise<HeroProgressTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      select: HERO_TERM_SELECT,
    });
  }

  findActiveTerm(
    academicYearId: string,
  ): Promise<HeroProgressTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { academicYearId, isActive: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      select: HERO_TERM_SELECT,
    });
  }

  findStudent(studentId: string): Promise<HeroProgressStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId, status: StudentStatus.ACTIVE },
      select: HERO_PROGRESS_STUDENT_SELECT,
    });
  }

  findEnrollmentForStudent(params: {
    studentId: string;
    enrollmentId: string;
  }): Promise<HeroProgressEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: params.enrollmentId,
        studentId: params.studentId,
        status: StudentEnrollmentStatus.ACTIVE,
      },
      select: HERO_PROGRESS_ENROLLMENT_SELECT,
    });
  }

  findActiveEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId: string;
  }): Promise<HeroProgressEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.termId }, { termId: null }],
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      orderBy: [{ termId: 'desc' }, { enrolledAt: 'desc' }, { id: 'asc' }],
      select: HERO_PROGRESS_ENROLLMENT_SELECT,
    });
  }

  findMissionForProgressStart(
    missionId: string,
  ): Promise<HeroProgressMissionRecord | null> {
    return this.scopedPrisma.heroMission.findFirst({
      where: { id: missionId },
      select: HERO_PROGRESS_MISSION_SELECT,
    });
  }

  findProgressById(
    progressId: string,
  ): Promise<HeroProgressDetailRecord | null> {
    return this.scopedPrisma.heroMissionProgress.findFirst({
      where: { id: progressId },
      ...HERO_PROGRESS_DETAIL_ARGS,
    });
  }

  findProgressByStudentMission(params: {
    studentId: string;
    missionId: string;
  }): Promise<HeroProgressDetailRecord | null> {
    return this.scopedPrisma.heroMissionProgress.findFirst({
      where: {
        studentId: params.studentId,
        missionId: params.missionId,
      },
      ...HERO_PROGRESS_DETAIL_ARGS,
    });
  }

  listStudentProgress(
    filters: ListStudentHeroProgressFilters,
  ): Promise<HeroProgressDetailRecord[]> {
    return this.scopedPrisma.heroMissionProgress.findMany({
      where: {
        studentId: filters.studentId,
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        ...(filters.status ? { status: filters.status } : {}),
        mission: {
          stageId: filters.stageId,
          deletedAt: null,
          ...(filters.includeArchived
            ? {}
            : { status: { not: HeroMissionStatus.ARCHIVED } }),
        },
      },
      orderBy: [
        { lastActivityAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      ...HERO_PROGRESS_DETAIL_ARGS,
    });
  }

  listAvailablePublishedMissionsForStudent(params: {
    academicYearId: string;
    termId: string;
    stageId: string;
    excludeMissionIds: string[];
  }): Promise<HeroProgressMissionRecord[]> {
    return this.scopedPrisma.heroMission.findMany({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        stageId: params.stageId,
        status: HeroMissionStatus.PUBLISHED,
        ...(params.excludeMissionIds.length > 0
          ? { id: { notIn: params.excludeMissionIds } }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: HERO_PROGRESS_MISSION_SELECT,
    });
  }

  findObjectiveById(
    objectiveId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<HeroProgressObjectiveRecord | null> {
    const query = () =>
      this.scopedPrisma.heroMissionObjective.findFirst({
        where: { id: objectiveId },
        select: HERO_PROGRESS_OBJECTIVE_SELECT,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  listCompletedObjectiveProgress(
    missionProgressId: string,
  ): Promise<HeroObjectiveProgressRecord[]> {
    return this.scopedPrisma.heroMissionObjectiveProgress.findMany({
      where: {
        missionProgressId,
        completedAt: { not: null },
      },
      select: HERO_OBJECTIVE_PROGRESS_SELECT,
    });
  }

  listRecentEventsForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId: string;
    stageId: string;
    limit?: number;
  }): Promise<HeroJourneyEventRecord[]> {
    return this.scopedPrisma.heroJourneyEvent.findMany({
      where: {
        studentId: params.studentId,
        mission: {
          academicYearId: params.academicYearId,
          termId: params.termId,
          stageId: params.stageId,
          deletedAt: null,
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: params.limit ?? 10,
      select: HERO_EVENT_SELECT,
    });
  }

  async startMissionProgress(params: {
    schoolId: string;
    missionId: string;
    studentId: string;
    enrollmentId: string;
    academicYearId: string;
    termId: string;
    actorId: string;
    metadata?: unknown;
  }): Promise<HeroProgressDetailRecord> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const progress = await tx.heroMissionProgress.create({
        data: {
          schoolId: params.schoolId,
          missionId: params.missionId,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          academicYearId: params.academicYearId,
          termId: params.termId,
          status: HeroMissionProgressStatus.IN_PROGRESS,
          progressPercent: 0,
          startedAt: now,
          lastActivityAt: now,
          metadata: this.toNullableJson(params.metadata),
        },
        select: { id: true },
      });

      await tx.heroJourneyEvent.create({
        data: {
          schoolId: params.schoolId,
          missionId: params.missionId,
          missionProgressId: progress.id,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          actorUserId: params.actorId,
          type: HeroJourneyEventType.MISSION_STARTED,
          occurredAt: now,
          metadata: this.toNullableJson(params.metadata),
        },
      });

      return this.findProgressInTransaction(tx, params.schoolId, progress.id);
    });
  }

  async completeObjectiveProgress(params: {
    schoolId: string;
    progressId: string;
    missionId: string;
    objectiveId: string;
    studentId: string;
    enrollmentId: string;
    actorId: string;
    progressPercent: number;
    startedAt?: Date | null;
    metadata?: unknown;
  }): Promise<{
    progress: HeroProgressDetailRecord;
    objectiveProgressId: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const existing = await tx.heroMissionObjectiveProgress.findFirst({
        where: {
          schoolId: params.schoolId,
          missionProgressId: params.progressId,
          objectiveId: params.objectiveId,
        },
        select: { id: true },
      });

      let objectiveProgressId = existing?.id;
      if (objectiveProgressId) {
        await tx.heroMissionObjectiveProgress.updateMany({
          where: {
            schoolId: params.schoolId,
            id: objectiveProgressId,
          },
          data: {
            completedAt: now,
            completedById: params.actorId,
            metadata: this.toNullableJson(params.metadata),
          },
        });
      } else {
        const created = await tx.heroMissionObjectiveProgress.create({
          data: {
            schoolId: params.schoolId,
            missionProgressId: params.progressId,
            objectiveId: params.objectiveId,
            completedAt: now,
            completedById: params.actorId,
            metadata: this.toNullableJson(params.metadata),
          },
          select: { id: true },
        });
        objectiveProgressId = created.id;
      }

      await tx.heroMissionProgress.updateMany({
        where: {
          schoolId: params.schoolId,
          id: params.progressId,
        },
        data: {
          status: HeroMissionProgressStatus.IN_PROGRESS,
          progressPercent: params.progressPercent,
          lastActivityAt: now,
          ...(params.startedAt ? { startedAt: params.startedAt } : {}),
        },
      });

      await tx.heroJourneyEvent.create({
        data: {
          schoolId: params.schoolId,
          missionId: params.missionId,
          missionProgressId: params.progressId,
          objectiveId: params.objectiveId,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          actorUserId: params.actorId,
          type: HeroJourneyEventType.OBJECTIVE_COMPLETED,
          occurredAt: now,
          metadata: this.toNullableJson(params.metadata),
        },
      });

      return {
        progress: await this.findProgressInTransaction(
          tx,
          params.schoolId,
          params.progressId,
        ),
        objectiveProgressId,
      };
    });
  }

  async completeMissionProgress(params: {
    schoolId: string;
    progressId: string;
    missionId: string;
    studentId: string;
    enrollmentId: string;
    actorId: string;
    metadata?: unknown;
  }): Promise<HeroProgressDetailRecord> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.heroMissionProgress.updateMany({
        where: {
          schoolId: params.schoolId,
          id: params.progressId,
        },
        data: {
          status: HeroMissionProgressStatus.COMPLETED,
          progressPercent: 100,
          completedAt: now,
          lastActivityAt: now,
        },
      });

      await tx.heroJourneyEvent.create({
        data: {
          schoolId: params.schoolId,
          missionId: params.missionId,
          missionProgressId: params.progressId,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          actorUserId: params.actorId,
          type: HeroJourneyEventType.MISSION_COMPLETED,
          occurredAt: now,
          metadata: this.toNullableJson(params.metadata),
        },
      });

      return this.findProgressInTransaction(
        tx,
        params.schoolId,
        params.progressId,
      );
    });
  }

  createHeroJourneyEvent(
    data: Prisma.HeroJourneyEventUncheckedCreateInput,
  ): Promise<HeroJourneyEventRecord> {
    return this.scopedPrisma.heroJourneyEvent.create({
      data,
      select: HERO_EVENT_SELECT,
    });
  }

  private async findProgressInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    progressId: string,
  ): Promise<HeroProgressDetailRecord> {
    const progress = await tx.heroMissionProgress.findFirst({
      where: {
        id: progressId,
        schoolId,
      },
      ...HERO_PROGRESS_DETAIL_ARGS,
    });

    if (!progress) {
      throw new Error('Hero mission progress mutation result was not found');
    }

    return progress;
  }

  private toNullableJson(
    value: unknown,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
