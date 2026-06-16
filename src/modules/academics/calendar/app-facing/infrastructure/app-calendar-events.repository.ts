import { Injectable } from '@nestjs/common';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { buildAppCalendarVisibilityWhere } from '../visibility/app-calendar-visibility.query';
import type {
  AppCalendarClassroomScope,
  AppCalendarVisibilityContext,
} from '../visibility/app-calendar-visibility.types';

const APP_CALENDAR_EVENT_ARGS =
  Prisma.validator<Prisma.AcademicCalendarEventDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      title: true,
      description: true,
      notes: true,
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

const APP_CALENDAR_ACADEMIC_YEAR_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

const APP_CALENDAR_TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const APP_CALENDAR_CLASSROOM_SCOPE_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      sectionId: true,
      section: {
        select: {
          id: true,
          schoolId: true,
          gradeId: true,
          grade: {
            select: {
              id: true,
              schoolId: true,
              stageId: true,
              stage: {
                select: {
                  id: true,
                  schoolId: true,
                },
              },
            },
          },
        },
      },
    },
  });

export type AppCalendarEventRecord = Prisma.AcademicCalendarEventGetPayload<
  typeof APP_CALENDAR_EVENT_ARGS
>;
export type AppCalendarAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof APP_CALENDAR_ACADEMIC_YEAR_ARGS
>;
export type AppCalendarTermRecord = Prisma.TermGetPayload<
  typeof APP_CALENDAR_TERM_ARGS
>;
type AppCalendarClassroomScopeRecord = Prisma.ClassroomGetPayload<
  typeof APP_CALENDAR_CLASSROOM_SCOPE_ARGS
>;

export interface ListAppCalendarEventsFilters {
  visibility: AppCalendarVisibilityContext;
  academicYearId?: string;
  termId?: string;
  from: Date;
  to: Date;
  type?: AcademicCalendarEventType;
  scopeType?: AcademicCalendarEventScopeType;
  limit: number;
  cursor?: string;
}

@Injectable()
export class AppCalendarEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYearForSchool(
    academicYearId: string,
  ): Promise<AppCalendarAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...APP_CALENDAR_ACADEMIC_YEAR_ARGS,
    });
  }

  findTermForSchool(termId: string): Promise<AppCalendarTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...APP_CALENDAR_TERM_ARGS,
    });
  }

  findTermForSchoolYear(
    termId: string,
    academicYearId: string,
  ): Promise<AppCalendarTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId, academicYearId },
      ...APP_CALENDAR_TERM_ARGS,
    });
  }

  async findClassroomScope(
    classroomId: string,
  ): Promise<AppCalendarClassroomScope | null> {
    const classroom =
      await this.scopedPrisma.classroom.findFirst({
        where: {
          id: classroomId,
          section: {
            is: {
              deletedAt: null,
              grade: {
                is: {
                  deletedAt: null,
                  stage: {
                    is: {
                      deletedAt: null,
                    },
                  },
                },
              },
            },
          },
        },
        ...APP_CALENDAR_CLASSROOM_SCOPE_ARGS,
      });

    return classroom ? toClassroomScope(classroom) : null;
  }

  listVisibleEvents(
    filters: ListAppCalendarEventsFilters,
  ): Promise<AppCalendarEventRecord[]> {
    const where: Prisma.AcademicCalendarEventWhereInput = {
      ...buildAppCalendarVisibilityWhere(filters.visibility),
      startDate: { lte: filters.to },
      endDate: { gte: filters.from },
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.scopeType ? { scopeType: filters.scopeType } : {}),
    };

    return this.scopedPrisma.academicCalendarEvent.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: filters.limit,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      ...APP_CALENDAR_EVENT_ARGS,
    });
  }

  findVisibleEventById(
    eventId: string,
    visibility: AppCalendarVisibilityContext,
  ): Promise<AppCalendarEventRecord | null> {
    return this.scopedPrisma.academicCalendarEvent.findFirst({
      where: {
        id: eventId,
        ...buildAppCalendarVisibilityWhere(visibility),
        ...(visibility.academicYearId
          ? { academicYearId: visibility.academicYearId }
          : {}),
        ...(visibility.termId ? { termId: visibility.termId } : {}),
      },
      ...APP_CALENDAR_EVENT_ARGS,
    });
  }
}

function toClassroomScope(
  classroom: AppCalendarClassroomScopeRecord,
): AppCalendarClassroomScope | null {
  const section = classroom.section;
  const grade = section?.grade;
  const stage = grade?.stage;

  if (!section || !grade || !stage) {
    return null;
  }

  if (
    section.schoolId !== classroom.schoolId ||
    grade.schoolId !== classroom.schoolId ||
    stage.schoolId !== classroom.schoolId
  ) {
    return null;
  }

  return {
    classroomId: classroom.id,
    schoolId: classroom.schoolId,
    sectionId: section.id,
    gradeId: grade.id,
    stageId: stage.id,
  };
}
