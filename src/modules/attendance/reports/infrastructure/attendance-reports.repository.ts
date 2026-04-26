import { Injectable } from '@nestjs/common';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_REFERENCE_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const STAGE_REFERENCE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
  },
});

const GRADE_REFERENCE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    stageId: true,
  },
});

const SECTION_REFERENCE_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    gradeId: true,
    grade: {
      select: {
        stageId: true,
      },
    },
  },
});

const CLASSROOM_REFERENCE_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
    select: {
      id: true,
      sectionId: true,
      section: {
        select: {
          gradeId: true,
          grade: {
            select: {
              stageId: true,
            },
          },
        },
      },
    },
  });

const PLACEMENT_NODE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.StageSelect;

const STAGE_SELECT = PLACEMENT_NODE_SELECT;

const GRADE_WITH_STAGE_SELECT = {
  ...PLACEMENT_NODE_SELECT,
  stage: {
    select: STAGE_SELECT,
  },
} satisfies Prisma.GradeSelect;

const SECTION_WITH_GRADE_SELECT = {
  ...PLACEMENT_NODE_SELECT,
  grade: {
    select: GRADE_WITH_STAGE_SELECT,
  },
} satisfies Prisma.SectionSelect;

const CLASSROOM_WITH_SECTION_SELECT = {
  ...PLACEMENT_NODE_SELECT,
  section: {
    select: SECTION_WITH_GRADE_SELECT,
  },
} satisfies Prisma.ClassroomSelect;

const ATTENDANCE_REPORT_ENTRY_ARGS =
  Prisma.validator<Prisma.AttendanceEntryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      sessionId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      session: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          date: true,
          scopeType: true,
          scopeKey: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
          mode: true,
          periodKey: true,
          status: true,
          deletedAt: true,
          stage: {
            select: STAGE_SELECT,
          },
          grade: {
            select: GRADE_WITH_STAGE_SELECT,
          },
          section: {
            select: SECTION_WITH_GRADE_SELECT,
          },
          classroom: {
            select: CLASSROOM_WITH_SECTION_SELECT,
          },
        },
      },
      enrollment: {
        select: {
          id: true,
          classroomId: true,
          classroom: {
            select: CLASSROOM_WITH_SECTION_SELECT,
          },
        },
      },
    },
  });

export type AcademicYearReferenceRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_REFERENCE_ARGS
>;
export type TermReferenceRecord = Prisma.TermGetPayload<
  typeof TERM_REFERENCE_ARGS
>;
export type StageReferenceRecord = Prisma.StageGetPayload<
  typeof STAGE_REFERENCE_ARGS
>;
export type GradeReferenceRecord = Prisma.GradeGetPayload<
  typeof GRADE_REFERENCE_ARGS
>;
export type SectionReferenceRecord = Prisma.SectionGetPayload<
  typeof SECTION_REFERENCE_ARGS
>;
export type ClassroomReferenceRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;
export type AttendanceReportEntryRecord = Prisma.AttendanceEntryGetPayload<
  typeof ATTENDANCE_REPORT_ENTRY_ARGS
>;

export interface AttendanceReportFilters {
  academicYearId?: string;
  termId?: string;
  date?: Date;
  dateFrom?: Date;
  dateTo?: Date;
  scopeType?: AttendanceScopeType;
  scopeKey?: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  mode?: AttendanceMode;
  periodKey?: string;
}

export interface AttendanceSummaryReportDataset {
  totalSessions: number;
  entries: AttendanceReportEntryRecord[];
}

@Injectable()
export class AttendanceReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getSummary(
    filters: AttendanceReportFilters,
  ): Promise<AttendanceSummaryReportDataset> {
    const [totalSessions, entries] = await Promise.all([
      this.scopedPrisma.attendanceSession.count({
        where: this.buildSubmittedSessionWhere(filters),
      }),
      this.scopedPrisma.attendanceEntry.findMany({
        where: this.buildSubmittedEntryWhere(filters),
        ...ATTENDANCE_REPORT_ENTRY_ARGS,
      }),
    ]);

    return { totalSessions, entries };
  }

  getDailyTrend(
    filters: AttendanceReportFilters,
  ): Promise<AttendanceReportEntryRecord[]> {
    return this.scopedPrisma.attendanceEntry.findMany({
      where: this.buildSubmittedEntryWhere(filters),
      orderBy: [{ session: { date: 'asc' } }, { id: 'asc' }],
      ...ATTENDANCE_REPORT_ENTRY_ARGS,
    });
  }

  getScopeBreakdown(
    filters: AttendanceReportFilters,
  ): Promise<AttendanceReportEntryRecord[]> {
    return this.scopedPrisma.attendanceEntry.findMany({
      where: this.buildSubmittedEntryWhere(filters),
      orderBy: [{ session: { date: 'asc' } }, { id: 'asc' }],
      ...ATTENDANCE_REPORT_ENTRY_ARGS,
    });
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<AcademicYearReferenceRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_REFERENCE_ARGS,
    });
  }

  findTermById(termId: string): Promise<TermReferenceRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  findStageById(stageId: string): Promise<StageReferenceRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_REFERENCE_ARGS,
    });
  }

  findGradeById(gradeId: string): Promise<GradeReferenceRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findSectionById(sectionId: string): Promise<SectionReferenceRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_REFERENCE_ARGS,
    });
  }

  findClassroomById(
    classroomId: string,
  ): Promise<ClassroomReferenceRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  private buildSubmittedEntryWhere(
    filters: AttendanceReportFilters,
  ): Prisma.AttendanceEntryWhereInput {
    return {
      session: this.buildSubmittedSessionWhere(filters),
    };
  }

  private buildSubmittedSessionWhere(
    filters: AttendanceReportFilters,
  ): Prisma.AttendanceSessionWhereInput {
    return {
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.scopeType ? { scopeType: filters.scopeType } : {}),
      ...(filters.scopeKey ? { scopeKey: filters.scopeKey } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
      ...(filters.mode ? { mode: filters.mode } : {}),
      ...(filters.periodKey ? { periodKey: filters.periodKey } : {}),
      ...this.buildSessionDateFilter(filters),
    };
  }

  private buildSessionDateFilter(
    filters: AttendanceReportFilters,
  ): Prisma.AttendanceSessionWhereInput {
    if (filters.date) {
      return { date: filters.date };
    }

    if (!filters.dateFrom && !filters.dateTo) {
      return {};
    }

    return {
      date: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    };
  }
}
