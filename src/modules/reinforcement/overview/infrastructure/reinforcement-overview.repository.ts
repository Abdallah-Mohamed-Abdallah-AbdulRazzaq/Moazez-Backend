import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

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

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const STAGE_REFERENCE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
  },
});

const GRADE_REFERENCE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    stageId: true,
    nameAr: true,
    nameEn: true,
  },
});

const SECTION_REFERENCE_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    gradeId: true,
    nameAr: true,
    nameEn: true,
    grade: {
      select: {
        stageId: true,
      },
    },
  },
});

const CLASSROOM_ARGS = Prisma.validator<Prisma.ClassroomDefaultArgs>()({
  select: {
    id: true,
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

const ENROLLMENT_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
  select: {
    id: true,
    studentId: true,
    academicYearId: true,
    termId: true,
    classroomId: true,
    status: true,
    enrolledAt: true,
    student: {
      select: STUDENT_SELECT,
    },
    classroom: CLASSROOM_ARGS,
  },
});

const TASK_ARGS = Prisma.validator<Prisma.ReinforcementTaskDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    termId: true,
    subjectId: true,
    titleEn: true,
    titleAr: true,
    source: true,
    status: true,
    dueDate: true,
    assignedById: true,
    assignedByName: true,
    createdAt: true,
    updatedAt: true,
    targets: {
      select: {
        id: true,
        scopeType: true,
        scopeKey: true,
        stageId: true,
        gradeId: true,
        sectionId: true,
        classroomId: true,
        studentId: true,
      },
    },
  },
});

const ASSIGNMENT_ARGS =
  Prisma.validator<Prisma.ReinforcementAssignmentDefaultArgs>()({
    select: {
      id: true,
      taskId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      progress: true,
      assignedAt: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: STUDENT_SELECT,
      },
      enrollment: ENROLLMENT_ARGS,
      task: TASK_ARGS,
    },
  });

const SUBMISSION_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: {
      id: true,
      assignmentId: true,
      taskId: true,
      stageId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      proofFileId: true,
      proofText: true,
      submittedById: true,
      submittedAt: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: STUDENT_SELECT,
      },
      enrollment: ENROLLMENT_ARGS,
      task: TASK_ARGS,
      stage: {
        select: {
          id: true,
          sortOrder: true,
          titleEn: true,
          titleAr: true,
          proofType: true,
          requiresApproval: true,
        },
      },
    },
  });

const REVIEW_ARGS = Prisma.validator<Prisma.ReinforcementReviewDefaultArgs>()({
  select: {
    id: true,
    submissionId: true,
    assignmentId: true,
    taskId: true,
    stageId: true,
    studentId: true,
    reviewedById: true,
    outcome: true,
    note: true,
    noteAr: true,
    reviewedAt: true,
    createdAt: true,
    updatedAt: true,
    student: {
      select: STUDENT_SELECT,
    },
    assignment: ASSIGNMENT_ARGS,
    task: TASK_ARGS,
    stage: {
      select: {
        id: true,
        sortOrder: true,
        titleEn: true,
        titleAr: true,
      },
    },
  },
});

const XP_LEDGER_ARGS = Prisma.validator<Prisma.XpLedgerDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    termId: true,
    studentId: true,
    enrollmentId: true,
    assignmentId: true,
    policyId: true,
    sourceType: true,
    sourceId: true,
    amount: true,
    reason: true,
    reasonAr: true,
    actorUserId: true,
    occurredAt: true,
    createdAt: true,
    student: {
      select: STUDENT_SELECT,
    },
    enrollment: ENROLLMENT_ARGS,
    assignment: {
      select: {
        id: true,
        task: TASK_ARGS,
      },
    },
  },
});

export type OverviewAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type OverviewTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type OverviewStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SELECT;
}>;
export type OverviewStageRecord = Prisma.StageGetPayload<
  typeof STAGE_REFERENCE_ARGS
>;
export type OverviewGradeRecord = Prisma.GradeGetPayload<
  typeof GRADE_REFERENCE_ARGS
>;
export type OverviewSectionRecord = Prisma.SectionGetPayload<
  typeof SECTION_REFERENCE_ARGS
>;
export type OverviewClassroomRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_ARGS
>;
export type OverviewEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_ARGS
>;
export type OverviewTaskRecord = Prisma.ReinforcementTaskGetPayload<
  typeof TASK_ARGS
>;
export type OverviewAssignmentRecord =
  Prisma.ReinforcementAssignmentGetPayload<typeof ASSIGNMENT_ARGS>;
export type OverviewSubmissionRecord =
  Prisma.ReinforcementSubmissionGetPayload<typeof SUBMISSION_ARGS>;
export type OverviewReviewRecord = Prisma.ReinforcementReviewGetPayload<
  typeof REVIEW_ARGS
>;
export type OverviewXpLedgerRecord = Prisma.XpLedgerGetPayload<
  typeof XP_LEDGER_ARGS
>;

export interface ReinforcementOverviewReadFilters {
  academicYearId: string;
  termId: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  source?: ReinforcementSource | null;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ReinforcementOverviewDataset {
  tasks: OverviewTaskRecord[];
  assignments: OverviewAssignmentRecord[];
  submissions: OverviewSubmissionRecord[];
  reviews: OverviewReviewRecord[];
  xpLedger: OverviewXpLedgerRecord[];
}

export interface StudentProgressDataset extends ReinforcementOverviewDataset {
  student: OverviewStudentRecord;
  enrollment: OverviewEnrollmentRecord | null;
}

export interface ClassroomSummaryDataset extends ReinforcementOverviewDataset {
  classroom: OverviewClassroomRecord;
  enrollments: OverviewEnrollmentRecord[];
}

@Injectable()
export class ReinforcementOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<OverviewAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findActiveAcademicYear(): Promise<OverviewAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTerm(termId: string): Promise<OverviewTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findActiveTerm(academicYearId: string): Promise<OverviewTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { academicYearId, isActive: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      ...TERM_ARGS,
    });
  }

  findStage(stageId: string): Promise<OverviewStageRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_REFERENCE_ARGS,
    });
  }

  findGrade(gradeId: string): Promise<OverviewGradeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findSection(sectionId: string): Promise<OverviewSectionRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_REFERENCE_ARGS,
    });
  }

  findClassroom(
    classroomId: string,
  ): Promise<OverviewClassroomRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_ARGS,
    });
  }

  findStudent(studentId: string): Promise<OverviewStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId, status: StudentStatus.ACTIVE },
      select: STUDENT_SELECT,
    });
  }

  findActiveEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId: string;
  }): Promise<OverviewEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.termId }, { termId: null }],
      },
      orderBy: [{ termId: 'desc' }, { enrolledAt: 'desc' }, { id: 'asc' }],
      ...ENROLLMENT_ARGS,
    });
  }

  listActiveEnrollmentsForClassroom(params: {
    classroomId: string;
    academicYearId: string;
    termId: string;
  }): Promise<OverviewEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        classroomId: params.classroomId,
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.termId }, { termId: null }],
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      orderBy: [{ enrolledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...ENROLLMENT_ARGS,
    });
  }

  async loadOverviewData(
    filters: ReinforcementOverviewReadFilters,
  ): Promise<ReinforcementOverviewDataset> {
    const [tasks, assignments, submissions, reviews, xpLedger] =
      await Promise.all([
        this.scopedPrisma.reinforcementTask.findMany({
          where: this.buildTaskWhere(filters),
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...TASK_ARGS,
        }),
        this.scopedPrisma.reinforcementAssignment.findMany({
          where: this.buildAssignmentWhere(filters),
          orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
          ...ASSIGNMENT_ARGS,
        }),
        this.scopedPrisma.reinforcementSubmission.findMany({
          where: this.buildSubmissionWhere(filters),
          orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
          ...SUBMISSION_ARGS,
        }),
        this.scopedPrisma.reinforcementReview.findMany({
          where: this.buildReviewWhere(filters),
          orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
          ...REVIEW_ARGS,
        }),
        this.scopedPrisma.xpLedger.findMany({
          where: this.buildXpLedgerWhere(filters),
          orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
          ...XP_LEDGER_ARGS,
        }),
      ]);

    return { tasks, assignments, submissions, reviews, xpLedger };
  }

  async loadStudentProgressData(
    params: ReinforcementOverviewReadFilters & { studentId: string },
  ): Promise<StudentProgressDataset | null> {
    const student = await this.findStudent(params.studentId);
    if (!student) {
      return null;
    }

    const enrollment = await this.findActiveEnrollmentForStudent(params);
    const dataset = await this.loadOverviewData(params);

    return {
      ...dataset,
      student,
      enrollment,
    };
  }

  async loadClassroomSummaryData(
    params: ReinforcementOverviewReadFilters & { classroomId: string },
  ): Promise<ClassroomSummaryDataset | null> {
    const classroom = await this.findClassroom(params.classroomId);
    if (!classroom) {
      return null;
    }

    const enrollments = await this.listActiveEnrollmentsForClassroom(params);
    const studentIds = enrollments.map((enrollment) => enrollment.studentId);
    const dataset = await this.loadOverviewData({
      ...params,
      classroomId: params.classroomId,
    });

    return {
      ...dataset,
      assignments: dataset.assignments.filter((assignment) =>
        studentIds.includes(assignment.studentId),
      ),
      submissions: dataset.submissions.filter((submission) =>
        studentIds.includes(submission.studentId),
      ),
      reviews: dataset.reviews.filter((review) =>
        studentIds.includes(review.studentId),
      ),
      xpLedger: dataset.xpLedger.filter((entry) =>
        studentIds.includes(entry.studentId),
      ),
      classroom,
      enrollments,
    };
  }

  private buildTaskWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementTaskWhereInput {
    const and: Prisma.ReinforcementTaskWhereInput[] = [
      this.buildTaskScopeWhere(filters),
      this.buildCreatedAtDateWhere(filters),
    ].filter((where) => Object.keys(where).length > 0);

    return {
      academicYearId: filters.academicYearId,
      termId: filters.termId,
      ...(filters.source ? { source: filters.source } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildAssignmentWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementAssignmentWhereInput {
    const and: Prisma.ReinforcementAssignmentWhereInput[] = [
      this.buildAssignmentScopeWhere(filters),
      this.buildAssignedAtDateWhere(filters),
    ].filter((where) => Object.keys(where).length > 0);

    return {
      academicYearId: filters.academicYearId,
      termId: filters.termId,
      task: {
        deletedAt: null,
        ...(filters.source ? { source: filters.source } : {}),
      },
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildSubmissionWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementSubmissionWhereInput {
    const and: Prisma.ReinforcementSubmissionWhereInput[] = [
      this.buildSubmissionScopeWhere(filters),
      this.buildSubmittedAtDateWhere(filters),
    ].filter((where) => Object.keys(where).length > 0);

    return {
      task: {
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        deletedAt: null,
        ...(filters.source ? { source: filters.source } : {}),
      },
      stage: { deletedAt: null },
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildReviewWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementReviewWhereInput {
    const and: Prisma.ReinforcementReviewWhereInput[] = [
      this.buildReviewScopeWhere(filters),
      this.buildReviewedAtDateWhere(filters),
    ].filter((where) => Object.keys(where).length > 0);

    return {
      task: {
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        deletedAt: null,
        ...(filters.source ? { source: filters.source } : {}),
      },
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildXpLedgerWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.XpLedgerWhereInput {
    const and: Prisma.XpLedgerWhereInput[] = [
      this.buildXpScopeWhere(filters),
      this.buildOccurredAtDateWhere(filters),
    ].filter((where) => Object.keys(where).length > 0);

    if (filters.source) {
      and.push({
        assignment: {
          task: {
            source: filters.source,
            deletedAt: null,
          },
        },
      });
    }

    return {
      academicYearId: filters.academicYearId,
      termId: filters.termId,
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildTaskScopeWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementTaskWhereInput {
    const targetOr = this.buildTaskTargetScopeOr(filters);
    const assignmentScope = this.buildAssignmentScopeWhere(filters);
    if (targetOr.length === 0 && Object.keys(assignmentScope).length === 0) {
      return {};
    }

    return {
      OR: [
        ...targetOr,
        ...(Object.keys(assignmentScope).length > 0
          ? [{ assignments: { some: assignmentScope } }]
          : []),
      ],
    };
  }

  private buildTaskTargetScopeOr(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementTaskWhereInput[] {
    const scopes: Prisma.ReinforcementTaskWhereInput[] = [];
    if (filters.stageId) {
      scopes.push({ targets: { some: { stageId: filters.stageId } } });
    }
    if (filters.gradeId) {
      scopes.push({ targets: { some: { gradeId: filters.gradeId } } });
    }
    if (filters.sectionId) {
      scopes.push({ targets: { some: { sectionId: filters.sectionId } } });
    }
    if (filters.classroomId) {
      scopes.push({ targets: { some: { classroomId: filters.classroomId } } });
    }
    if (filters.studentId) {
      scopes.push({ targets: { some: { studentId: filters.studentId } } });
    }

    return scopes;
  }

  private buildAssignmentScopeWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementAssignmentWhereInput {
    const classroomWhere = this.buildClassroomScopeWhere(filters);
    if (Object.keys(classroomWhere).length === 0) return {};

    return {
      enrollment: {
        classroom: classroomWhere,
      },
    };
  }

  private buildSubmissionScopeWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementSubmissionWhereInput {
    const classroomWhere = this.buildClassroomScopeWhere(filters);
    if (Object.keys(classroomWhere).length === 0) return {};

    return {
      enrollment: {
        classroom: classroomWhere,
      },
    };
  }

  private buildReviewScopeWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementReviewWhereInput {
    const classroomWhere = this.buildClassroomScopeWhere(filters);
    if (Object.keys(classroomWhere).length === 0) return {};

    return {
      assignment: {
        enrollment: {
          classroom: classroomWhere,
        },
      },
    };
  }

  private buildXpScopeWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.XpLedgerWhereInput {
    const classroomWhere = this.buildClassroomScopeWhere(filters);
    if (Object.keys(classroomWhere).length === 0) return {};

    return {
      enrollment: {
        classroom: classroomWhere,
      },
    };
  }

  private buildClassroomScopeWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ClassroomWhereInput {
    if (filters.classroomId) {
      return { id: filters.classroomId };
    }
    if (filters.sectionId) {
      return { sectionId: filters.sectionId };
    }
    if (filters.gradeId) {
      return { section: { gradeId: filters.gradeId } };
    }
    if (filters.stageId) {
      return { section: { grade: { stageId: filters.stageId } } };
    }

    return {};
  }

  private buildCreatedAtDateWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementTaskWhereInput {
    return this.dateFilter('createdAt', filters);
  }

  private buildAssignedAtDateWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementAssignmentWhereInput {
    return this.dateFilter('assignedAt', filters);
  }

  private buildSubmittedAtDateWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementSubmissionWhereInput {
    return this.dateFilter('submittedAt', filters);
  }

  private buildReviewedAtDateWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.ReinforcementReviewWhereInput {
    return this.dateFilter('reviewedAt', filters);
  }

  private buildOccurredAtDateWhere(
    filters: ReinforcementOverviewReadFilters,
  ): Prisma.XpLedgerWhereInput {
    return this.dateFilter('occurredAt', filters);
  }

  private dateFilter<T extends string>(
    field: T,
    filters: ReinforcementOverviewReadFilters,
  ): Record<T, { gte?: Date; lte?: Date }> | Record<string, never> {
    if (!filters.dateFrom && !filters.dateTo) return {};

    return {
      [field]: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    } as Record<T, { gte?: Date; lte?: Date }>;
  }
}
