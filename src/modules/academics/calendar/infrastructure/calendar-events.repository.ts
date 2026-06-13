import { Injectable } from '@nestjs/common';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  Prisma,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
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
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const STAGE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
  },
});

const GRADE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    stageId: true,
  },
});

const SECTION_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    gradeId: true,
  },
});

const CALENDAR_EVENT_ARGS =
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
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

export type CalendarAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type CalendarTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type CalendarStageRecord = Prisma.StageGetPayload<typeof STAGE_ARGS>;
export type CalendarGradeRecord = Prisma.GradeGetPayload<typeof GRADE_ARGS>;
export type CalendarSectionRecord = Prisma.SectionGetPayload<
  typeof SECTION_ARGS
>;
export type CalendarEventRecord = Prisma.AcademicCalendarEventGetPayload<
  typeof CALENDAR_EVENT_ARGS
>;

export interface ListCalendarEventsFilters {
  academicYearId?: string;
  termId?: string;
  from: Date;
  to: Date;
  type?: AcademicCalendarEventType;
  scopeType?: AcademicCalendarEventScopeType;
  scopeKey?: string | null;
  limit: number;
  cursor?: string;
}

export type SoftDeleteCalendarEventResult =
  | { status: 'deleted'; event: CalendarEventRecord }
  | { status: 'not_found' };

@Injectable()
export class CalendarEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'CalendarEventsRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  findAcademicYearForSchool(
    academicYearId: string,
  ): Promise<CalendarAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTermForSchool(termId: string): Promise<CalendarTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findTermForSchoolYear(
    termId: string,
    academicYearId: string,
  ): Promise<CalendarTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId, academicYearId },
      ...TERM_ARGS,
    });
  }

  findStageForSchool(stageId: string): Promise<CalendarStageRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_ARGS,
    });
  }

  findGradeForSchool(gradeId: string): Promise<CalendarGradeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_ARGS,
    });
  }

  findSectionForSchool(
    sectionId: string,
  ): Promise<CalendarSectionRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_ARGS,
    });
  }

  listEvents(filters: ListCalendarEventsFilters): Promise<CalendarEventRecord[]> {
    const where: Prisma.AcademicCalendarEventWhereInput = {
      startDate: { lte: filters.to },
      endDate: { gte: filters.from },
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.scopeType ? { scopeType: filters.scopeType } : {}),
      ...(filters.scopeKey !== undefined ? { scopeKey: filters.scopeKey } : {}),
    };

    return this.scopedPrisma.academicCalendarEvent.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: filters.limit,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      ...CALENDAR_EVENT_ARGS,
    });
  }

  findEventById(eventId: string): Promise<CalendarEventRecord | null> {
    return this.scopedPrisma.academicCalendarEvent.findFirst({
      where: { id: eventId },
      ...CALENDAR_EVENT_ARGS,
    });
  }

  createEvent(
    data: Prisma.AcademicCalendarEventUncheckedCreateInput,
  ): Promise<CalendarEventRecord> {
    return this.scopedPrisma.academicCalendarEvent.create({
      data,
      ...CALENDAR_EVENT_ARGS,
    });
  }

  updateEvent(
    eventId: string,
    data: Prisma.AcademicCalendarEventUncheckedUpdateInput,
  ): Promise<CalendarEventRecord> {
    return this.scopedPrisma.academicCalendarEvent.update({
      where: { id: eventId },
      data,
      ...CALENDAR_EVENT_ARGS,
    });
  }

  async softDeleteEvent(
    eventId: string,
    deletedByUserId: string,
  ): Promise<SoftDeleteCalendarEventResult> {
    const schoolId = this.getCurrentSchoolId();
    const deletedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.academicCalendarEvent.findFirst({
        where: { id: eventId, schoolId, deletedAt: null },
        ...CALENDAR_EVENT_ARGS,
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      const event = await tx.academicCalendarEvent.update({
        where: {
          id_schoolId: {
            id: eventId,
            schoolId,
          },
        },
        data: {
          deletedAt,
          deletedByUserId,
          updatedByUserId: deletedByUserId,
        },
        ...CALENDAR_EVENT_ARGS,
      });

      return { status: 'deleted', event };
    });
  }
}
