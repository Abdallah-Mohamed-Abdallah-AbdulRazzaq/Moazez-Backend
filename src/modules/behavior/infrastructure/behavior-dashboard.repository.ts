import { Injectable } from '@nestjs/common';
import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const CATEGORY_SUMMARY_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  type: true,
  defaultSeverity: true,
  defaultPoints: true,
  isActive: true,
} satisfies Prisma.BehaviorCategorySelect;

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    nameEn: true,
    nameAr: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    nameEn: true,
    nameAr: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const STUDENT_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: STUDENT_SUMMARY_SELECT,
});

const CLASSROOM_ARGS = Prisma.validator<Prisma.ClassroomDefaultArgs>()({
  select: {
    id: true,
    nameEn: true,
    nameAr: true,
    sectionId: true,
    section: {
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        gradeId: true,
        grade: {
          select: {
            id: true,
            nameEn: true,
            nameAr: true,
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
});

const ACTIVE_ENROLLMENT_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()(
  {
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      enrolledAt: true,
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
    },
  },
);

const BEHAVIOR_DASHBOARD_RECORD_ARGS =
  Prisma.validator<Prisma.BehaviorRecordDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      categoryId: true,
      type: true,
      severity: true,
      status: true,
      titleEn: true,
      titleAr: true,
      noteEn: true,
      noteAr: true,
      points: true,
      occurredAt: true,
      submittedAt: true,
      reviewedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      enrollment: {
        select: {
          id: true,
          classroomId: true,
          classroom: CLASSROOM_ARGS,
        },
      },
      category: {
        select: CATEGORY_SUMMARY_SELECT,
      },
    },
  });

const BEHAVIOR_DASHBOARD_LEDGER_ARGS =
  Prisma.validator<Prisma.BehaviorPointLedgerDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      recordId: true,
      categoryId: true,
      entryType: true,
      amount: true,
      actorId: true,
      occurredAt: true,
      createdAt: true,
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      category: {
        select: CATEGORY_SUMMARY_SELECT,
      },
      record: {
        select: {
          id: true,
          type: true,
          severity: true,
          status: true,
          occurredAt: true,
          createdAt: true,
        },
      },
    },
  });

const BEHAVIOR_CATEGORY_ARGS =
  Prisma.validator<Prisma.BehaviorCategoryDefaultArgs>()({
    select: CATEGORY_SUMMARY_SELECT,
  });

export type BehaviorDashboardAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type BehaviorDashboardTermRecord = Prisma.TermGetPayload<
  typeof TERM_ARGS
>;
export type BehaviorDashboardStudentRecord = Prisma.StudentGetPayload<
  typeof STUDENT_ARGS
>;
export type BehaviorDashboardClassroomRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_ARGS
>;
export type BehaviorDashboardEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ACTIVE_ENROLLMENT_ARGS
>;
export type BehaviorDashboardRecord = Prisma.BehaviorRecordGetPayload<
  typeof BEHAVIOR_DASHBOARD_RECORD_ARGS
>;
export type BehaviorDashboardPointLedgerRecord =
  Prisma.BehaviorPointLedgerGetPayload<typeof BEHAVIOR_DASHBOARD_LEDGER_ARGS>;
export type BehaviorDashboardCategoryRecord = Prisma.BehaviorCategoryGetPayload<
  typeof BEHAVIOR_CATEGORY_ARGS
>;

export interface BehaviorDashboardReadFilters {
  academicYearId?: string | null;
  termId?: string | null;
  enrollmentAcademicYearId?: string | null;
  studentId?: string | null;
  classroomId?: string | null;
  type?: BehaviorRecordType | null;
  severity?: BehaviorSeverity | null;
  status?: BehaviorRecordStatus | null;
  occurredFrom?: Date | null;
  occurredTo?: Date | null;
  studentIds?: string[] | null;
}

export interface BehaviorOverviewDataset {
  records: BehaviorDashboardRecord[];
  ledgerEntries: BehaviorDashboardPointLedgerRecord[];
  categories: BehaviorDashboardCategoryRecord[];
  scopedStudents: BehaviorDashboardStudentRecord[];
}

export interface StudentBehaviorSummaryDataset extends BehaviorOverviewDataset {
  student: BehaviorDashboardStudentRecord;
}

export interface ClassroomBehaviorSummaryDataset extends BehaviorOverviewDataset {
  classroom: BehaviorDashboardClassroomRecord;
  activeEnrollments: BehaviorDashboardEnrollmentRecord[];
}

@Injectable()
export class BehaviorDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<BehaviorDashboardAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTerm(termId: string): Promise<BehaviorDashboardTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findStudent(
    studentId: string,
  ): Promise<BehaviorDashboardStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_ARGS,
    });
  }

  findClassroom(
    classroomId: string,
  ): Promise<BehaviorDashboardClassroomRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_ARGS,
    });
  }

  async loadBehaviorOverviewData(
    filters: BehaviorDashboardReadFilters,
  ): Promise<BehaviorOverviewDataset> {
    const scopedFilters = await this.buildClassroomScopedFilters(filters);
    const [records, ledgerEntries, categories] = await Promise.all([
      this.loadBehaviorRecordsForScope(scopedFilters),
      this.loadBehaviorPointLedgerForScope(scopedFilters),
      this.loadCategoriesForScope(scopedFilters),
    ]);

    return {
      records,
      ledgerEntries,
      categories,
      scopedStudents: scopedFilters.scopedStudents,
    };
  }

  async loadStudentBehaviorSummaryData(
    filters: BehaviorDashboardReadFilters & { studentId: string },
  ): Promise<StudentBehaviorSummaryDataset | null> {
    const student = await this.findStudent(filters.studentId);
    if (!student) return null;

    const scopedFilters: BehaviorDashboardReadFilters = {
      ...filters,
      studentId: student.id,
    };
    const [records, ledgerEntries, categories] = await Promise.all([
      this.loadBehaviorRecordsForScope(scopedFilters),
      this.loadBehaviorPointLedgerForScope(scopedFilters),
      this.loadCategoriesForScope(scopedFilters),
    ]);

    return {
      records,
      ledgerEntries,
      categories,
      scopedStudents: [student],
      student,
    };
  }

  async loadClassroomBehaviorSummaryData(
    filters: BehaviorDashboardReadFilters & { classroomId: string },
  ): Promise<ClassroomBehaviorSummaryDataset | null> {
    const classroom = await this.findClassroom(filters.classroomId);
    if (!classroom) return null;

    const activeEnrollments = await this.loadActiveClassroomStudents({
      classroomId: filters.classroomId,
      academicYearId:
        filters.enrollmentAcademicYearId ?? filters.academicYearId ?? null,
      termId: filters.termId ?? null,
    });
    const studentIds = activeEnrollments.map(
      (enrollment) => enrollment.studentId,
    );
    const scopedFilters = {
      ...filters,
      studentIds,
    };
    const [records, ledgerEntries, categories] = await Promise.all([
      this.loadBehaviorRecordsForScope(scopedFilters),
      this.loadBehaviorPointLedgerForScope(scopedFilters),
      this.loadCategoriesForScope(scopedFilters),
    ]);

    return {
      records,
      ledgerEntries,
      categories,
      scopedStudents: activeEnrollments.map((enrollment) => enrollment.student),
      classroom,
      activeEnrollments,
    };
  }

  loadActiveClassroomStudents(params: {
    classroomId: string;
    academicYearId?: string | null;
    termId?: string | null;
  }): Promise<BehaviorDashboardEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        ...(params.academicYearId
          ? { academicYearId: params.academicYearId }
          : {}),
        ...(params.termId
          ? { OR: [{ termId: params.termId }, { termId: null }] }
          : {}),
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      orderBy: [{ enrolledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...ACTIVE_ENROLLMENT_ARGS,
    });
  }

  loadBehaviorRecordsForScope(
    filters: BehaviorDashboardReadFilters,
  ): Promise<BehaviorDashboardRecord[]> {
    return this.scopedPrisma.behaviorRecord.findMany({
      where: this.buildRecordWhere(filters),
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...BEHAVIOR_DASHBOARD_RECORD_ARGS,
    });
  }

  loadBehaviorPointLedgerForScope(
    filters: BehaviorDashboardReadFilters,
  ): Promise<BehaviorDashboardPointLedgerRecord[]> {
    return this.scopedPrisma.behaviorPointLedger.findMany({
      where: this.buildLedgerWhere(filters),
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      ...BEHAVIOR_DASHBOARD_LEDGER_ARGS,
    });
  }

  loadCategoriesForScope(
    filters: BehaviorDashboardReadFilters,
  ): Promise<BehaviorDashboardCategoryRecord[]> {
    return this.scopedPrisma.behaviorCategory.findMany({
      where: {
        ...(filters.type ? { type: filters.type } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      ...BEHAVIOR_CATEGORY_ARGS,
    });
  }

  loadRecentBehaviorRecords(
    filters: BehaviorDashboardReadFilters,
    limit = 15,
  ): Promise<BehaviorDashboardRecord[]> {
    return this.scopedPrisma.behaviorRecord.findMany({
      where: this.buildRecordWhere(filters),
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      ...BEHAVIOR_DASHBOARD_RECORD_ARGS,
    });
  }

  loadTopCategoryCandidates(
    filters: BehaviorDashboardReadFilters,
  ): Promise<BehaviorDashboardRecord[]> {
    return this.scopedPrisma.behaviorRecord.findMany({
      where: this.buildRecordWhere(filters),
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...BEHAVIOR_DASHBOARD_RECORD_ARGS,
    });
  }

  private async buildClassroomScopedFilters(
    filters: BehaviorDashboardReadFilters,
  ): Promise<
    BehaviorDashboardReadFilters & {
      scopedStudents: BehaviorDashboardStudentRecord[];
    }
  > {
    if (!filters.classroomId) {
      const scopedStudent = filters.studentId
        ? await this.findStudent(filters.studentId)
        : null;
      return {
        ...filters,
        scopedStudents: scopedStudent ? [scopedStudent] : [],
      };
    }

    const activeEnrollments = await this.loadActiveClassroomStudents({
      classroomId: filters.classroomId,
      academicYearId:
        filters.enrollmentAcademicYearId ?? filters.academicYearId ?? null,
      termId: filters.termId ?? null,
    });
    const studentIds = activeEnrollments.map(
      (enrollment) => enrollment.studentId,
    );

    return {
      ...filters,
      studentIds,
      scopedStudents: activeEnrollments.map((enrollment) => enrollment.student),
    };
  }

  private buildRecordWhere(
    filters: BehaviorDashboardReadFilters,
  ): Prisma.BehaviorRecordWhereInput {
    const and: Prisma.BehaviorRecordWhereInput[] = [];
    const studentScope = this.buildStudentScopeWhere(filters);

    if (Object.keys(studentScope).length > 0) {
      and.push(studentScope);
    }

    if (filters.occurredFrom || filters.occurredTo) {
      and.push({
        occurredAt: {
          ...(filters.occurredFrom ? { gte: filters.occurredFrom } : {}),
          ...(filters.occurredTo ? { lte: filters.occurredTo } : {}),
        },
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildLedgerWhere(
    filters: BehaviorDashboardReadFilters,
  ): Prisma.BehaviorPointLedgerWhereInput {
    const and: Prisma.BehaviorPointLedgerWhereInput[] = [];
    const studentScope = this.buildLedgerStudentScopeWhere(filters);
    const recordScope = this.buildLedgerRecordScopeWhere(filters);

    if (Object.keys(studentScope).length > 0) {
      and.push(studentScope);
    }

    if (Object.keys(recordScope).length > 0) {
      and.push(recordScope);
    }

    if (filters.occurredFrom || filters.occurredTo) {
      and.push({
        occurredAt: {
          ...(filters.occurredFrom ? { gte: filters.occurredFrom } : {}),
          ...(filters.occurredTo ? { lte: filters.occurredTo } : {}),
        },
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildStudentScopeWhere(
    filters: BehaviorDashboardReadFilters,
  ): Prisma.BehaviorRecordWhereInput {
    const studentIds = filters.studentIds ?? null;
    if (studentIds && studentIds.length === 0) return { id: { in: [] } };
    if (
      filters.studentId &&
      studentIds &&
      !studentIds.includes(filters.studentId)
    ) {
      return { id: { in: [] } };
    }
    if (filters.studentId) return { studentId: filters.studentId };
    if (studentIds) return { studentId: { in: studentIds } };
    return {};
  }

  private buildLedgerStudentScopeWhere(
    filters: BehaviorDashboardReadFilters,
  ): Prisma.BehaviorPointLedgerWhereInput {
    const studentIds = filters.studentIds ?? null;
    if (studentIds && studentIds.length === 0) return { id: { in: [] } };
    if (
      filters.studentId &&
      studentIds &&
      !studentIds.includes(filters.studentId)
    ) {
      return { id: { in: [] } };
    }
    if (filters.studentId) return { studentId: filters.studentId };
    if (studentIds) return { studentId: { in: studentIds } };
    return {};
  }

  private buildLedgerRecordScopeWhere(
    filters: BehaviorDashboardReadFilters,
  ): Prisma.BehaviorPointLedgerWhereInput {
    if (!filters.type && !filters.severity && !filters.status) return {};

    return {
      record: {
        deletedAt: null,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
    };
  }
}
