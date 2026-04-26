import { Injectable } from '@nestjs/common';
import {
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { resolveAttendanceIncidentStatuses } from '../domain/attendance-incident';

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

const ATTENDANCE_ABSENCE_INCIDENT_ARGS =
  Prisma.validator<Prisma.AttendanceEntryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      sessionId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
      excuseReason: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
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
      session: {
        select: {
          id: true,
          schoolId: true,
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
          periodId: true,
          periodKey: true,
          periodLabelAr: true,
          periodLabelEn: true,
          policyId: true,
          status: true,
          submittedAt: true,
          submittedById: true,
          createdAt: true,
          updatedAt: true,
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
    },
  });

const ATTENDANCE_ABSENCE_SUMMARY_ARGS =
  Prisma.validator<Prisma.AttendanceEntryDefaultArgs>()({
    select: {
      status: true,
      studentId: true,
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
export type AttendanceAbsenceIncidentRecord = Prisma.AttendanceEntryGetPayload<
  typeof ATTENDANCE_ABSENCE_INCIDENT_ARGS
>;
export type AttendanceAbsenceSummaryRecord = Prisma.AttendanceEntryGetPayload<
  typeof ATTENDANCE_ABSENCE_SUMMARY_ARGS
>;

export interface ListAttendanceAbsencesFilters {
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
  studentId?: string;
  status?: AttendanceStatus;
}

@Injectable()
export class AttendanceAbsencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listIncidents(
    filters: ListAttendanceAbsencesFilters,
  ): Promise<AttendanceAbsenceIncidentRecord[]> {
    const statuses = resolveAttendanceIncidentStatuses(filters.status);
    if (statuses.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.attendanceEntry.findMany({
      where: this.buildIncidentWhere(filters),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      ...ATTENDANCE_ABSENCE_INCIDENT_ARGS,
    });
  }

  getIncidentSummary(
    filters: ListAttendanceAbsencesFilters,
  ): Promise<AttendanceAbsenceSummaryRecord[]> {
    const statuses = resolveAttendanceIncidentStatuses(filters.status);
    if (statuses.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.attendanceEntry.findMany({
      where: this.buildIncidentWhere(filters),
      ...ATTENDANCE_ABSENCE_SUMMARY_ARGS,
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

  private buildIncidentWhere(
    filters: ListAttendanceAbsencesFilters,
  ): Prisma.AttendanceEntryWhereInput {
    const statuses = resolveAttendanceIncidentStatuses(filters.status);

    return {
      status: { in: statuses },
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      session: {
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
        ...this.buildSessionDateFilter(filters),
      },
    };
  }

  private buildSessionDateFilter(
    filters: ListAttendanceAbsencesFilters,
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
