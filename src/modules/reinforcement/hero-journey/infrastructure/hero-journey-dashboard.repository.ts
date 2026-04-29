import { Injectable } from '@nestjs/common';
import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const HERO_DASHBOARD_STUDENT_SELECT = {
  id: true,
  schoolId: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const HERO_DASHBOARD_BADGE_SELECT = {
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
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.HeroBadgeSelect;

const HERO_DASHBOARD_OBJECTIVE_SELECT = {
  id: true,
  schoolId: true,
  missionId: true,
  type: true,
  titleEn: true,
  titleAr: true,
  subtitleEn: true,
  subtitleAr: true,
  sortOrder: true,
  isRequired: true,
  deletedAt: true,
} satisfies Prisma.HeroMissionObjectiveSelect;

const HERO_DASHBOARD_MISSION_ARGS =
  Prisma.validator<Prisma.HeroMissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      stageId: true,
      subjectId: true,
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
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      badgeReward: {
        select: HERO_DASHBOARD_BADGE_SELECT,
      },
      objectives: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HERO_DASHBOARD_OBJECTIVE_SELECT,
      },
    },
  });

const HERO_DASHBOARD_CLASSROOM_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      nameAr: true,
      nameEn: true,
      sectionId: true,
      section: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          gradeId: true,
          grade: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              stageId: true,
              stage: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                },
              },
            },
          },
        },
      },
    },
  });

const HERO_DASHBOARD_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      student: {
        select: HERO_DASHBOARD_STUDENT_SELECT,
      },
      classroom: HERO_DASHBOARD_CLASSROOM_ARGS,
    },
  });

const HERO_OBJECTIVE_PROGRESS_SELECT = {
  id: true,
  schoolId: true,
  missionProgressId: true,
  objectiveId: true,
  completedAt: true,
  objective: {
    select: {
      id: true,
      missionId: true,
      isRequired: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.HeroMissionObjectiveProgressSelect;

const HERO_DASHBOARD_PROGRESS_ARGS =
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
      student: {
        select: HERO_DASHBOARD_STUDENT_SELECT,
      },
      enrollment: HERO_DASHBOARD_ENROLLMENT_ARGS,
      objectiveProgress: {
        select: HERO_OBJECTIVE_PROGRESS_SELECT,
      },
    },
  });

const HERO_DASHBOARD_XP_LEDGER_ARGS =
  Prisma.validator<Prisma.XpLedgerDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      sourceType: true,
      sourceId: true,
      amount: true,
      reason: true,
      reasonAr: true,
      actorUserId: true,
      occurredAt: true,
      createdAt: true,
      student: {
        select: HERO_DASHBOARD_STUDENT_SELECT,
      },
    },
  });

const HERO_DASHBOARD_STUDENT_BADGE_ARGS =
  Prisma.validator<Prisma.HeroStudentBadgeDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      badgeId: true,
      missionId: true,
      missionProgressId: true,
      earnedAt: true,
      createdAt: true,
      student: {
        select: HERO_DASHBOARD_STUDENT_SELECT,
      },
      badge: {
        select: HERO_DASHBOARD_BADGE_SELECT,
      },
      mission: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          stageId: true,
          subjectId: true,
          deletedAt: true,
        },
      },
    },
  });

const HERO_DASHBOARD_EVENT_ARGS =
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
      createdAt: true,
    },
  });

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    nameAr: true,
    nameEn: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const STAGE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
  },
});

const GRADE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    stageId: true,
    nameAr: true,
    nameEn: true,
  },
});

const SECTION_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    gradeId: true,
    nameAr: true,
    nameEn: true,
    grade: {
      select: {
        id: true,
        stageId: true,
      },
    },
  },
});

const SUBJECT_ARGS = Prisma.validator<Prisma.SubjectDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    code: true,
    isActive: true,
  },
});

export type HeroDashboardAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type HeroDashboardTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type HeroDashboardStageRecord = Prisma.StageGetPayload<typeof STAGE_ARGS>;
export type HeroDashboardGradeRecord = Prisma.GradeGetPayload<typeof GRADE_ARGS>;
export type HeroDashboardSectionRecord = Prisma.SectionGetPayload<
  typeof SECTION_ARGS
>;
export type HeroDashboardClassroomRecord = Prisma.ClassroomGetPayload<
  typeof HERO_DASHBOARD_CLASSROOM_ARGS
>;
export type HeroDashboardSubjectRecord = Prisma.SubjectGetPayload<
  typeof SUBJECT_ARGS
>;
export type HeroDashboardStudentRecord = Prisma.StudentGetPayload<{
  select: typeof HERO_DASHBOARD_STUDENT_SELECT;
}>;
export type HeroDashboardBadgeRecord = Prisma.HeroBadgeGetPayload<{
  select: typeof HERO_DASHBOARD_BADGE_SELECT;
}>;
export type HeroDashboardMissionRecord = Prisma.HeroMissionGetPayload<
  typeof HERO_DASHBOARD_MISSION_ARGS
>;
export type HeroDashboardEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof HERO_DASHBOARD_ENROLLMENT_ARGS
>;
export type HeroDashboardProgressRecord = Prisma.HeroMissionProgressGetPayload<
  typeof HERO_DASHBOARD_PROGRESS_ARGS
>;
export type HeroDashboardXpLedgerRecord = Prisma.XpLedgerGetPayload<
  typeof HERO_DASHBOARD_XP_LEDGER_ARGS
>;
export type HeroDashboardStudentBadgeRecord =
  Prisma.HeroStudentBadgeGetPayload<typeof HERO_DASHBOARD_STUDENT_BADGE_ARGS>;
export type HeroDashboardEventRecord = Prisma.HeroJourneyEventGetPayload<
  typeof HERO_DASHBOARD_EVENT_ARGS
>;

export interface HeroDashboardReadFilters {
  academicYearId: string;
  termId: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  subjectId?: string | null;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface HeroMapReadFilters {
  academicYearId: string;
  termId: string;
  stageId?: string | null;
  subjectId?: string | null;
  studentId?: string | null;
  includeDraft?: boolean;
  includeArchived?: boolean;
}

export interface HeroBadgeSummaryReadFilters {
  academicYearId: string;
  termId: string;
  stageId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  includeInactive?: boolean;
}

export interface HeroDashboardDataset {
  enrollments: HeroDashboardEnrollmentRecord[];
  missions: HeroDashboardMissionRecord[];
  progress: HeroDashboardProgressRecord[];
  xpLedger: HeroDashboardXpLedgerRecord[];
  studentBadges: HeroDashboardStudentBadgeRecord[];
  events: HeroDashboardEventRecord[];
}

export interface HeroMapDataset {
  missions: HeroDashboardMissionRecord[];
  progress: HeroDashboardProgressRecord[];
  xpLedger: HeroDashboardXpLedgerRecord[];
  studentBadges: HeroDashboardStudentBadgeRecord[];
}

export interface HeroBadgeSummaryDataset {
  badges: HeroDashboardBadgeRecord[];
  missionsUsingBadges: HeroDashboardMissionRecord[];
  studentBadges: HeroDashboardStudentBadgeRecord[];
}

@Injectable()
export class HeroJourneyDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<HeroDashboardAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findActiveAcademicYear(): Promise<HeroDashboardAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTerm(termId: string): Promise<HeroDashboardTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findActiveTerm(
    academicYearId: string,
  ): Promise<HeroDashboardTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { academicYearId, isActive: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      ...TERM_ARGS,
    });
  }

  findStage(stageId: string): Promise<HeroDashboardStageRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_ARGS,
    });
  }

  findGrade(gradeId: string): Promise<HeroDashboardGradeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_ARGS,
    });
  }

  findSection(sectionId: string): Promise<HeroDashboardSectionRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_ARGS,
    });
  }

  findClassroom(
    classroomId: string,
  ): Promise<HeroDashboardClassroomRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...HERO_DASHBOARD_CLASSROOM_ARGS,
    });
  }

  findSubject(subjectId: string): Promise<HeroDashboardSubjectRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      ...SUBJECT_ARGS,
    });
  }

  findStudent(studentId: string): Promise<HeroDashboardStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId, status: StudentStatus.ACTIVE },
      select: HERO_DASHBOARD_STUDENT_SELECT,
    });
  }

  findActiveEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId: string;
  }): Promise<HeroDashboardEnrollmentRecord | null> {
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
      ...HERO_DASHBOARD_ENROLLMENT_ARGS,
    });
  }

  async loadHeroOverviewData(
    filters: HeroDashboardReadFilters,
  ): Promise<HeroDashboardDataset> {
    const enrollments = await this.loadActiveEnrollmentsForScope(filters);
    const studentIds = enrollments.map((enrollment) => enrollment.studentId);
    const missionWhere = this.buildMissionWhere(filters);

    const [missions, progress, xpLedger, studentBadges, events] =
      await Promise.all([
        this.scopedPrisma.heroMission.findMany({
          where: missionWhere,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
          ...HERO_DASHBOARD_MISSION_ARGS,
        }),
        this.listHeroProgress(filters, studentIds),
        this.loadHeroXpLedgerForStudents(filters, studentIds),
        this.loadHeroBadgeAwardsForStudents(filters, studentIds),
        this.loadHeroEvents(filters, studentIds),
      ]);

    return { enrollments, missions, progress, xpLedger, studentBadges, events };
  }

  async loadHeroMapData(filters: HeroMapReadFilters): Promise<HeroMapDataset> {
    const studentIds = filters.studentId ? [filters.studentId] : undefined;
    const missions = await this.scopedPrisma.heroMission.findMany({
      where: this.buildMapMissionWhere(filters),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_MISSION_ARGS,
    });
    const missionIds = missions.map((mission) => mission.id);

    if (missionIds.length === 0) {
      return { missions, progress: [], xpLedger: [], studentBadges: [] };
    }

    const progress = await this.scopedPrisma.heroMissionProgress.findMany({
      where: {
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        missionId: { in: missionIds },
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
      },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_PROGRESS_ARGS,
    });
    const progressIds = progress.map((row) => row.id);
    const [xpLedger, studentBadges] = await Promise.all([
      this.scopedPrisma.xpLedger.findMany({
        where: {
          academicYearId: filters.academicYearId,
          termId: filters.termId,
          sourceType: XpSourceType.HERO_MISSION,
          sourceId: { in: progressIds },
          ...(studentIds ? { studentId: { in: studentIds } } : {}),
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        ...HERO_DASHBOARD_XP_LEDGER_ARGS,
      }),
      this.scopedPrisma.heroStudentBadge.findMany({
        where: {
          missionId: { in: missionIds },
          ...(studentIds ? { studentId: { in: studentIds } } : {}),
        },
        orderBy: [{ earnedAt: 'desc' }, { id: 'asc' }],
        ...HERO_DASHBOARD_STUDENT_BADGE_ARGS,
      }),
    ]);

    return { missions, progress, xpLedger, studentBadges };
  }

  loadHeroStageSummaryData(
    filters: HeroDashboardReadFilters & { stageId: string },
  ): Promise<HeroDashboardDataset> {
    return this.loadHeroOverviewData(filters);
  }

  loadHeroClassroomSummaryData(
    filters: HeroDashboardReadFilters & { classroomId: string },
  ): Promise<HeroDashboardDataset> {
    return this.loadHeroOverviewData(filters);
  }

  async loadHeroBadgeSummaryData(
    filters: HeroBadgeSummaryReadFilters,
  ): Promise<HeroBadgeSummaryDataset> {
    const enrollments = await this.loadActiveEnrollmentsForScope(filters);
    const studentIds = enrollments.map((enrollment) => enrollment.studentId);
    const [badges, missionsUsingBadges, studentBadges] = await Promise.all([
      this.scopedPrisma.heroBadge.findMany({
        where: {
          ...(filters.includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HERO_DASHBOARD_BADGE_SELECT,
      }),
      this.scopedPrisma.heroMission.findMany({
        where: {
          academicYearId: filters.academicYearId,
          termId: filters.termId,
          ...(filters.stageId ? { stageId: filters.stageId } : {}),
          badgeRewardId: { not: null },
          status: { not: HeroMissionStatus.ARCHIVED },
        },
        ...HERO_DASHBOARD_MISSION_ARGS,
      }),
      this.loadHeroBadgeAwardsForStudents(filters, studentIds),
    ]);

    return { badges, missionsUsingBadges, studentBadges };
  }

  loadActiveEnrollmentsForScope(params: {
    academicYearId: string;
    termId: string;
    stageId?: string | null;
    gradeId?: string | null;
    sectionId?: string | null;
    classroomId?: string | null;
    studentId?: string | null;
  }): Promise<HeroDashboardEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.termId }, { termId: null }],
        ...(params.studentId ? { studentId: params.studentId } : {}),
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
        classroom: this.buildClassroomScopeWhere(params),
      },
      orderBy: [{ enrolledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_ENROLLMENT_ARGS,
    });
  }

  private listHeroProgress(
    filters: HeroDashboardReadFilters,
    studentIds: string[],
  ): Promise<HeroDashboardProgressRecord[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.heroMissionProgress.findMany({
      where: {
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        studentId: { in: studentIds },
        mission: this.buildMissionWhere(filters),
        ...this.buildProgressDateWhere(filters),
      },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_PROGRESS_ARGS,
    });
  }

  loadHeroXpLedgerForStudents(
    filters: HeroDashboardReadFilters,
    studentIds: string[],
  ): Promise<HeroDashboardXpLedgerRecord[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.xpLedger.findMany({
      where: {
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        studentId: { in: studentIds },
        sourceType: XpSourceType.HERO_MISSION,
        ...this.buildOccurredAtDateWhere(filters),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_XP_LEDGER_ARGS,
    });
  }

  loadHeroBadgeAwardsForStudents(
    filters: {
      academicYearId: string;
      termId: string;
      stageId?: string | null;
      studentId?: string | null;
      dateFrom?: Date;
      dateTo?: Date;
    },
    studentIds: string[],
  ): Promise<HeroDashboardStudentBadgeRecord[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.heroStudentBadge.findMany({
      where: {
        studentId: { in: studentIds },
        mission: {
          academicYearId: filters.academicYearId,
          termId: filters.termId,
          ...(filters.stageId ? { stageId: filters.stageId } : {}),
          deletedAt: null,
        },
        ...this.buildEarnedAtDateWhere(filters),
      },
      orderBy: [{ earnedAt: 'desc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_STUDENT_BADGE_ARGS,
    });
  }

  loadHeroEvents(
    filters: HeroDashboardReadFilters,
    studentIds: string[],
  ): Promise<HeroDashboardEventRecord[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.heroJourneyEvent.findMany({
      where: {
        studentId: { in: studentIds },
        mission: this.buildMissionWhere(filters),
        ...this.buildOccurredAtDateWhere(filters),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...HERO_DASHBOARD_EVENT_ARGS,
    });
  }

  private buildMissionWhere(
    filters: {
      academicYearId: string;
      termId: string;
      stageId?: string | null;
      subjectId?: string | null;
    },
  ): Prisma.HeroMissionWhereInput {
    return {
      academicYearId: filters.academicYearId,
      termId: filters.termId,
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      deletedAt: null,
    };
  }

  private buildMapMissionWhere(
    filters: HeroMapReadFilters,
  ): Prisma.HeroMissionWhereInput {
    const statusFilters: HeroMissionStatus[] = [];
    if (!filters.includeDraft) statusFilters.push(HeroMissionStatus.DRAFT);
    if (!filters.includeArchived) statusFilters.push(HeroMissionStatus.ARCHIVED);

    return {
      academicYearId: filters.academicYearId,
      termId: filters.termId,
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(statusFilters.length > 0 ? { status: { notIn: statusFilters } } : {}),
      deletedAt: null,
    };
  }

  private buildClassroomScopeWhere(params: {
    stageId?: string | null;
    gradeId?: string | null;
    sectionId?: string | null;
    classroomId?: string | null;
  }): Prisma.ClassroomWhereInput {
    if (params.classroomId) return { id: params.classroomId };
    if (params.sectionId) return { sectionId: params.sectionId };
    if (params.gradeId) return { section: { gradeId: params.gradeId } };
    if (params.stageId) {
      return { section: { grade: { stageId: params.stageId } } };
    }

    return {};
  }

  private buildProgressDateWhere(
    filters: HeroDashboardReadFilters,
  ): Prisma.HeroMissionProgressWhereInput {
    if (!filters.dateFrom && !filters.dateTo) return {};
    const range = this.dateRange(filters);
    return {
      OR: [
        { startedAt: range },
        { completedAt: range },
        { lastActivityAt: range },
      ],
    };
  }

  private buildOccurredAtDateWhere(filters: {
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.XpLedgerWhereInput & Prisma.HeroJourneyEventWhereInput {
    if (!filters.dateFrom && !filters.dateTo) return {};
    return { occurredAt: this.dateRange(filters) };
  }

  private buildEarnedAtDateWhere(filters: {
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.HeroStudentBadgeWhereInput {
    if (!filters.dateFrom && !filters.dateTo) return {};
    return { earnedAt: this.dateRange(filters) };
  }

  private dateRange(filters: {
    dateFrom?: Date;
    dateTo?: Date;
  }): { gte?: Date; lte?: Date } {
    return {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
}
