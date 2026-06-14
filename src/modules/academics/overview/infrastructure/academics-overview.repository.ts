import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  Prisma,
  TimetableEntryStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
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
    schoolId: true,
    academicYearId: true,
    nameAr: true,
    nameEn: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const UPCOMING_CALENDAR_EVENT_ARGS =
  Prisma.validator<Prisma.AcademicCalendarEventDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      title: true,
      type: true,
      scopeType: true,
      scopeKey: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      allDay: true,
      startDate: true,
      endDate: true,
      createdByUserId: true,
      updatedByUserId: true,
      deletedByUserId: true,
      deletedAt: true,
    },
  });

export type AcademicsOverviewAcademicYearRecord =
  Prisma.AcademicYearGetPayload<typeof ACADEMIC_YEAR_ARGS>;

export type AcademicsOverviewTermRecord = Prisma.TermGetPayload<
  typeof TERM_ARGS
>;

export type AcademicsOverviewUpcomingEventRecord =
  Prisma.AcademicCalendarEventGetPayload<
    typeof UPCOMING_CALENDAR_EVENT_ARGS
  >;

export interface AcademicsOverviewContextFilter {
  academicYearId: string;
  termId?: string;
}

export interface AcademicsOverviewStructureCounts {
  stagesCount: number;
  gradesCount: number;
  sectionsCount: number;
  classroomsCount: number;
}

export interface AcademicsOverviewSubjectCounts {
  subjectsCount: number;
  activeSubjectsCount: number;
}

export interface AcademicsOverviewRoomCounts {
  roomsCount: number;
}

export interface AcademicsOverviewTeacherAllocationCounts {
  allocationsCount: number;
  allocatedTeachersCount: number;
  allocatedSubjectsCount: number;
}

export interface AcademicsOverviewCurriculumCounts {
  curriculaCount: number;
  activeCurriculaCount: number;
  unitsCount: number;
  lessonsCount: number;
}

export interface AcademicsOverviewLessonPlanCounts {
  lessonPlansCount: number;
  plannedItemsCount: number;
}

export interface AcademicsOverviewTimetableCounts {
  entriesCount: number;
  activeEntriesCount: number;
}

export interface AcademicsOverviewCalendarCounts {
  eventsCount: number;
  upcomingEventsCount: number;
}

@Injectable()
export class AcademicsOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findActiveAcademicYear(): Promise<AcademicsOverviewAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<AcademicsOverviewAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findActiveTermForYear(
    academicYearId: string,
  ): Promise<AcademicsOverviewTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { academicYearId, isActive: true },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...TERM_ARGS,
    });
  }

  findTermById(termId: string): Promise<AcademicsOverviewTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  async countStructure(): Promise<AcademicsOverviewStructureCounts> {
    const [stagesCount, gradesCount, sectionsCount, classroomsCount] =
      await Promise.all([
        this.scopedPrisma.stage.count(),
        this.scopedPrisma.grade.count(),
        this.scopedPrisma.section.count(),
        this.scopedPrisma.classroom.count(),
      ]);

    return { stagesCount, gradesCount, sectionsCount, classroomsCount };
  }

  async countSubjects(): Promise<AcademicsOverviewSubjectCounts> {
    const [subjectsCount, activeSubjectsCount] = await Promise.all([
      this.scopedPrisma.subject.count(),
      this.scopedPrisma.subject.count({ where: { isActive: true } }),
    ]);

    return { subjectsCount, activeSubjectsCount };
  }

  async countRooms(): Promise<AcademicsOverviewRoomCounts> {
    return { roomsCount: await this.scopedPrisma.room.count() };
  }

  async countTeacherAllocations(
    context: AcademicsOverviewContextFilter,
  ): Promise<AcademicsOverviewTeacherAllocationCounts> {
    const where: Prisma.TeacherSubjectAllocationWhereInput = context.termId
      ? { termId: context.termId }
      : { term: { is: { academicYearId: context.academicYearId } } };
    const [allocationsCount, allocatedTeachers, allocatedSubjects] =
      await Promise.all([
        this.scopedPrisma.teacherSubjectAllocation.count({ where }),
        this.scopedPrisma.teacherSubjectAllocation.findMany({
          where,
          distinct: ['teacherUserId'],
          select: { teacherUserId: true },
        }),
        this.scopedPrisma.teacherSubjectAllocation.findMany({
          where,
          distinct: ['subjectId'],
          select: { subjectId: true },
        }),
      ]);

    return {
      allocationsCount,
      allocatedTeachersCount: allocatedTeachers.length,
      allocatedSubjectsCount: allocatedSubjects.length,
    };
  }

  async countCurriculum(
    context: AcademicsOverviewContextFilter,
  ): Promise<AcademicsOverviewCurriculumCounts> {
    const where = this.withAcademicContext<Prisma.CurriculumWhereInput>(
      {},
      context,
    );
    const curricula = await this.scopedPrisma.curriculum.findMany({
      where,
      select: { id: true, status: true },
    });
    const curriculumIds = curricula.map((curriculum) => curriculum.id);
    const activeCurriculaCount = curricula.filter(
      (curriculum) => curriculum.status === CurriculumStatus.ACTIVE,
    ).length;

    if (curriculumIds.length === 0) {
      return {
        curriculaCount: 0,
        activeCurriculaCount: 0,
        unitsCount: 0,
        lessonsCount: 0,
      };
    }

    const [unitsCount, lessonsCount] = await Promise.all([
      this.scopedPrisma.curriculumUnit.count({
        where: { curriculumId: { in: curriculumIds } },
      }),
      this.scopedPrisma.curriculumLesson.count({
        where: { curriculumId: { in: curriculumIds } },
      }),
    ]);

    return {
      curriculaCount: curricula.length,
      activeCurriculaCount,
      unitsCount,
      lessonsCount,
    };
  }

  async countLessonPlans(
    context: AcademicsOverviewContextFilter,
  ): Promise<AcademicsOverviewLessonPlanCounts> {
    const where = this.withAcademicContext<Prisma.LessonPlanWhereInput>(
      {},
      context,
    );
    const lessonPlans = await this.scopedPrisma.lessonPlan.findMany({
      where,
      select: { id: true },
    });
    const lessonPlanIds = lessonPlans.map((lessonPlan) => lessonPlan.id);

    if (lessonPlanIds.length === 0) {
      return { lessonPlansCount: 0, plannedItemsCount: 0 };
    }

    const plannedItemsCount = await this.scopedPrisma.lessonPlanItem.count({
      where: { lessonPlanId: { in: lessonPlanIds } },
    });

    return {
      lessonPlansCount: lessonPlans.length,
      plannedItemsCount,
    };
  }

  async countTimetable(
    context: AcademicsOverviewContextFilter,
  ): Promise<AcademicsOverviewTimetableCounts> {
    const where = this.withAcademicContext<Prisma.TimetableEntryWhereInput>(
      {},
      context,
    );
    const [entriesCount, activeEntriesCount] = await Promise.all([
      this.scopedPrisma.timetableEntry.count({ where }),
      this.scopedPrisma.timetableEntry.count({
        where: { ...where, status: TimetableEntryStatus.ACTIVE },
      }),
    ]);

    return { entriesCount, activeEntriesCount };
  }

  async countCalendarEvents(
    context: AcademicsOverviewContextFilter,
    now: Date,
  ): Promise<AcademicsOverviewCalendarCounts> {
    const where =
      this.withAcademicContext<Prisma.AcademicCalendarEventWhereInput>(
        {},
        context,
      );
    const [eventsCount, upcomingEventsCount] = await Promise.all([
      this.scopedPrisma.academicCalendarEvent.count({ where }),
      this.scopedPrisma.academicCalendarEvent.count({
        where: { ...where, endDate: { gte: now } },
      }),
    ]);

    return { eventsCount, upcomingEventsCount };
  }

  listUpcomingCalendarEvents(
    context: AcademicsOverviewContextFilter,
    now: Date,
    limit = 5,
  ): Promise<AcademicsOverviewUpcomingEventRecord[]> {
    const where =
      this.withAcademicContext<Prisma.AcademicCalendarEventWhereInput>(
        { endDate: { gte: now } },
        context,
      );

    return this.scopedPrisma.academicCalendarEvent.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      ...UPCOMING_CALENDAR_EVENT_ARGS,
    });
  }

  private withAcademicContext<T extends Record<string, unknown>>(
    where: T,
    context: AcademicsOverviewContextFilter,
  ): T {
    return {
      ...where,
      academicYearId: context.academicYearId,
      ...(context.termId ? { termId: context.termId } : {}),
    };
  }

}
