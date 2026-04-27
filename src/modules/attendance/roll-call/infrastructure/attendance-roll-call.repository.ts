import { Injectable } from '@nestjs/common';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  EffectiveScopeCandidate,
  NormalizedAttendancePolicyScope,
} from '../../policies/domain/policy-scope';

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

const EFFECTIVE_POLICY_ARGS =
  Prisma.validator<Prisma.AttendancePolicyDefaultArgs>()({
    select: {
      id: true,
      scopeType: true,
      scopeKey: true,
      effectiveFrom: true,
      effectiveTo: true,
      updatedAt: true,
    },
  });

const ROSTER_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      enrolledAt: true,
      endedAt: true,
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
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
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
      },
    },
  });

const ATTENDANCE_ENTRY_ARGS =
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
      markedById: true,
      markedAt: true,
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
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              section: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  grade: {
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
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
          },
        },
      },
    },
  });

const ATTENDANCE_SESSION_SUMMARY_ARGS =
  Prisma.validator<Prisma.AttendanceSessionDefaultArgs>()({
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
    },
  });

const ATTENDANCE_SESSION_DETAIL_ARGS =
  Prisma.validator<Prisma.AttendanceSessionDefaultArgs>()({
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
      entries: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: ATTENDANCE_ENTRY_ARGS.select,
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
export type EffectiveAttendancePolicyRecord = Prisma.AttendancePolicyGetPayload<
  typeof EFFECTIVE_POLICY_ARGS
>;
export type RollCallRosterEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ROSTER_ENROLLMENT_ARGS
>;
export type RollCallAttendanceEntryRecord = Prisma.AttendanceEntryGetPayload<
  typeof ATTENDANCE_ENTRY_ARGS
>;
export type RollCallSessionSummaryRecord = Prisma.AttendanceSessionGetPayload<
  typeof ATTENDANCE_SESSION_SUMMARY_ARGS
>;
export type RollCallSessionDetailRecord = Prisma.AttendanceSessionGetPayload<
  typeof ATTENDANCE_SESSION_DETAIL_ARGS
>;

export interface RollCallSessionLookup {
  academicYearId: string;
  termId: string;
  date: Date;
  scopeType: AttendanceScopeType;
  scopeKey: string;
  mode: AttendanceMode;
  periodKey: string;
}

export interface ListRollCallSessionsFilters {
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
  status?: AttendanceSessionStatus;
  mode?: AttendanceMode;
}

export interface RollCallEntryUpsertInput {
  studentId: string;
  enrollmentId: string | null;
  status: AttendanceStatus;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  excuseReason: string | null;
  note: string | null;
}

@Injectable()
export class AttendanceRollCallRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
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

  listRosterStudents(params: {
    academicYearId: string;
    termId: string;
    scope: NormalizedAttendancePolicyScope;
  }): Promise<RollCallRosterEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.termId }, { termId: null }],
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
        classroom: this.buildRosterClassroomWhere(params.scope),
      },
      orderBy: [{ classroomId: 'asc' }, { enrolledAt: 'asc' }, { id: 'asc' }],
      ...ROSTER_ENROLLMENT_ARGS,
    });
  }

  findEffectivePolicyCandidates(params: {
    academicYearId: string;
    termId: string;
    candidates: EffectiveScopeCandidate[];
    date?: Date;
  }): Promise<EffectiveAttendancePolicyRecord[]> {
    return this.scopedPrisma.attendancePolicy.findMany({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        isActive: true,
        OR: params.candidates.map((candidate) => ({
          scopeType: candidate.scopeType,
          scopeKey: candidate.scopeKey,
        })),
        ...(params.date
          ? {
              AND: [
                {
                  OR: [
                    { effectiveFrom: null },
                    { effectiveFrom: { lte: params.date } },
                  ],
                },
                {
                  OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: params.date } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      ...EFFECTIVE_POLICY_ARGS,
    });
  }

  findSessionByKey(
    lookup: RollCallSessionLookup,
  ): Promise<RollCallSessionDetailRecord | null> {
    return this.scopedPrisma.attendanceSession.findFirst({
      where: {
        academicYearId: lookup.academicYearId,
        termId: lookup.termId,
        date: lookup.date,
        scopeType: lookup.scopeType,
        scopeKey: lookup.scopeKey,
        mode: lookup.mode,
        periodKey: lookup.periodKey,
      },
      ...ATTENDANCE_SESSION_DETAIL_ARGS,
    });
  }

  createSession(
    data: Prisma.AttendanceSessionUncheckedCreateInput,
  ): Promise<RollCallSessionDetailRecord> {
    return this.scopedPrisma.attendanceSession.create({
      data,
      ...ATTENDANCE_SESSION_DETAIL_ARGS,
    });
  }

  listSessions(
    filters: ListRollCallSessionsFilters,
  ): Promise<RollCallSessionSummaryRecord[]> {
    return this.scopedPrisma.attendanceSession.findMany({
      where: this.buildListSessionsWhere(filters),
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...ATTENDANCE_SESSION_SUMMARY_ARGS,
    });
  }

  findSessionById(
    sessionId: string,
  ): Promise<RollCallSessionDetailRecord | null> {
    return this.scopedPrisma.attendanceSession.findFirst({
      where: { id: sessionId },
      ...ATTENDANCE_SESSION_DETAIL_ARGS,
    });
  }

  submitSession(params: {
    sessionId: string;
    schoolId: string;
    submittedAt: Date;
    submittedById: string | null;
  }): Promise<RollCallSessionDetailRecord> {
    return this.prisma.attendanceSession.update({
      where: {
        id_schoolId: {
          id: params.sessionId,
          schoolId: params.schoolId,
        },
      },
      data: {
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: params.submittedAt,
        submittedById: params.submittedById,
      },
      ...ATTENDANCE_SESSION_DETAIL_ARGS,
    });
  }

  unsubmitSession(params: {
    sessionId: string;
    schoolId: string;
  }): Promise<RollCallSessionDetailRecord> {
    return this.prisma.attendanceSession.update({
      where: {
        id_schoolId: {
          id: params.sessionId,
          schoolId: params.schoolId,
        },
      },
      data: {
        status: AttendanceSessionStatus.DRAFT,
        submittedAt: null,
        submittedById: null,
      },
      ...ATTENDANCE_SESSION_DETAIL_ARGS,
    });
  }

  bulkUpsertEntries(params: {
    schoolId: string;
    sessionId: string;
    markedById: string | null;
    markedAt: Date;
    entries: RollCallEntryUpsertInput[];
  }): Promise<RollCallAttendanceEntryRecord[]> {
    return this.prisma.$transaction(
      params.entries.map((entry) =>
        this.prisma.attendanceEntry.upsert({
          where: {
            schoolId_sessionId_studentId: {
              schoolId: params.schoolId,
              sessionId: params.sessionId,
              studentId: entry.studentId,
            },
          },
          create: {
            schoolId: params.schoolId,
            sessionId: params.sessionId,
            studentId: entry.studentId,
            enrollmentId: entry.enrollmentId,
            status: entry.status,
            lateMinutes: entry.lateMinutes,
            earlyLeaveMinutes: entry.earlyLeaveMinutes,
            excuseReason: entry.excuseReason,
            note: entry.note,
            markedById: params.markedById,
            markedAt: params.markedAt,
          },
          update: {
            enrollmentId: entry.enrollmentId,
            status: entry.status,
            lateMinutes: entry.lateMinutes,
            earlyLeaveMinutes: entry.earlyLeaveMinutes,
            excuseReason: entry.excuseReason,
            note: entry.note,
            markedById: params.markedById,
            markedAt: params.markedAt,
          },
          ...ATTENDANCE_ENTRY_ARGS,
        }),
      ),
    );
  }

  private buildRosterClassroomWhere(
    scope: NormalizedAttendancePolicyScope,
  ): Prisma.ClassroomWhereInput {
    switch (scope.scopeType) {
      case AttendanceScopeType.SCHOOL:
        return { deletedAt: null };
      case AttendanceScopeType.STAGE:
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            grade: {
              deletedAt: null,
              stageId: scope.stageId ?? undefined,
            },
          },
        };
      case AttendanceScopeType.GRADE:
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            gradeId: scope.gradeId ?? undefined,
          },
        };
      case AttendanceScopeType.SECTION:
        return {
          deletedAt: null,
          sectionId: scope.sectionId ?? undefined,
        };
      case AttendanceScopeType.CLASSROOM:
        return {
          deletedAt: null,
          id: scope.classroomId ?? undefined,
        };
    }
  }

  private buildListSessionsWhere(
    filters: ListRollCallSessionsFilters,
  ): Prisma.AttendanceSessionWhereInput {
    return {
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
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.mode ? { mode: filters.mode } : {}),
      ...this.buildDateFilter(filters),
    };
  }

  private buildDateFilter(
    filters: ListRollCallSessionsFilters,
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
