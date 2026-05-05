import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentType,
  GradeItemStatus,
  GradeSubmissionStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import type {
  GetTeacherClassroomGradebookQueryDto,
  ListTeacherClassroomAssignmentSubmissionsQueryDto,
  ListTeacherClassroomAssignmentsQueryDto,
  ListTeacherClassroomAssessmentsQueryDto,
  TeacherClassroomAssignmentSubmissionStatus,
  TeacherClassroomAssessmentStatus,
  TeacherClassroomAssessmentType,
} from '../dto/teacher-classroom-grades.dto';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_GRADEBOOK_LIMIT = 50;
const MAX_LIMIT = 100;

const ASSESSMENT_CARD_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      subjectId: true,
      classroomId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      deliveryMode: true,
      date: true,
      weight: true,
      maxScore: true,
      expectedTimeMinutes: true,
      approvalStatus: true,
      publishedAt: true,
      approvedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          items: true,
          submissions: true,
          questions: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

const ASSESSMENT_DETAIL_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      subjectId: true,
      classroomId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      deliveryMode: true,
      date: true,
      weight: true,
      maxScore: true,
      expectedTimeMinutes: true,
      approvalStatus: true,
      publishedAt: true,
      approvedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          items: true,
          submissions: true,
          questions: {
            where: { deletedAt: null },
          },
        },
      },
      questions: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          type: true,
          prompt: true,
          promptAr: true,
          points: true,
          sortOrder: true,
          required: true,
          _count: {
            select: {
              options: {
                where: { deletedAt: null },
              },
            },
          },
        },
      },
    },
  });

const GRADEBOOK_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      classroomId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

const GRADE_ITEM_ARGS = Prisma.validator<Prisma.GradeItemDefaultArgs>()({
  select: {
    id: true,
    assessmentId: true,
    studentId: true,
    score: true,
    status: true,
  },
});

const ASSIGNMENT_SUBMISSION_LIST_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      correctedAt: true,
      totalScore: true,
      maxScore: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      answers: {
        select: {
          id: true,
          correctionStatus: true,
        },
      },
    },
  });

const ASSIGNMENT_SUBMISSION_DETAIL_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      correctedAt: true,
      totalScore: true,
      maxScore: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      answers: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          questionId: true,
          answerText: true,
          answerJson: true,
          correctionStatus: true,
          awardedPoints: true,
          maxPoints: true,
          reviewerComment: true,
          reviewerCommentAr: true,
          reviewedAt: true,
          selectedOptions: {
            orderBy: [{ createdAt: 'asc' }, { optionId: 'asc' }],
            select: {
              optionId: true,
              option: {
                select: {
                  id: true,
                  label: true,
                  labelAr: true,
                  value: true,
                },
              },
            },
          },
        },
      },
    },
  });

export type TeacherClassroomAssessmentCardRecord =
  Prisma.GradeAssessmentGetPayload<typeof ASSESSMENT_CARD_ARGS>;
export type TeacherClassroomAssessmentDetailRecord =
  Prisma.GradeAssessmentGetPayload<typeof ASSESSMENT_DETAIL_ARGS>;
export type TeacherClassroomGradebookEnrollmentRecord =
  Prisma.EnrollmentGetPayload<typeof GRADEBOOK_ENROLLMENT_ARGS>;
export type TeacherClassroomGradebookItemRecord = Prisma.GradeItemGetPayload<
  typeof GRADE_ITEM_ARGS
>;
export type TeacherClassroomAssignmentSubmissionListRecord =
  Prisma.GradeSubmissionGetPayload<typeof ASSIGNMENT_SUBMISSION_LIST_ARGS>;
export type TeacherClassroomAssignmentSubmissionDetailRecord =
  Prisma.GradeSubmissionGetPayload<typeof ASSIGNMENT_SUBMISSION_DETAIL_ARGS>;

export interface TeacherClassroomAssessmentListResult {
  items: TeacherClassroomAssessmentCardRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface TeacherClassroomAssessmentDetailResult {
  assessment: TeacherClassroomAssessmentDetailRecord;
  itemStatusCounts: Map<GradeItemStatus, number>;
  submissionStatusCounts: Map<GradeSubmissionStatus, number>;
}

export interface TeacherClassroomGradebookResult {
  enrollments: TeacherClassroomGradebookEnrollmentRecord[];
  assessments: TeacherClassroomAssessmentCardRecord[];
  gradeItems: TeacherClassroomGradebookItemRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface TeacherClassroomAssignmentsResult {
  items: TeacherClassroomAssessmentCardRecord[];
  gradedCounts: Map<string, number>;
  submissionCounts: Map<string, number>;
  page: number;
  limit: number;
  total: number;
}

export interface TeacherClassroomAssignmentDetailResult {
  assignment: TeacherClassroomAssessmentDetailRecord;
  itemStatusCounts: Map<GradeItemStatus, number>;
  submissionStatusCounts: Map<GradeSubmissionStatus, number>;
}

export interface TeacherClassroomAssignmentSubmissionsResult {
  assignment: TeacherClassroomAssessmentCardRecord;
  submissions: TeacherClassroomAssignmentSubmissionListRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface TeacherClassroomAssignmentSubmissionDetailResult {
  assignment: TeacherClassroomAssessmentDetailRecord;
  submission: TeacherClassroomAssignmentSubmissionDetailRecord;
}

@Injectable()
export class TeacherClassroomGradesReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listAssessments(params: {
    allocation: TeacherAppAllocationRecord;
    filters?: ListTeacherClassroomAssessmentsQueryDto;
  }): Promise<TeacherClassroomAssessmentListResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_LIST_LIMIT);
    const page = resolvePage(params.filters?.page);
    const where = buildAssessmentWhere({
      allocation: params.allocation,
      filters: params.filters,
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.gradeAssessment.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...ASSESSMENT_CARD_ARGS,
      }),
      this.scopedPrisma.gradeAssessment.count({ where }),
    ]);

    return { items, page, limit, total };
  }

  async getAssessmentDetail(params: {
    allocation: TeacherAppAllocationRecord;
    assessmentId: string;
  }): Promise<TeacherClassroomAssessmentDetailResult> {
    const assessment = await this.scopedPrisma.gradeAssessment.findFirst({
      where: buildAssessmentWhere({
        allocation: params.allocation,
        assessmentId: params.assessmentId,
      }),
      ...ASSESSMENT_DETAIL_ARGS,
    });

    if (!assessment) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId: params.assessmentId,
      });
    }

    const [itemStatusRows, submissionStatusRows] = await Promise.all([
      this.scopedPrisma.gradeItem.groupBy({
        by: ['status'],
        where: { assessmentId: assessment.id },
        _count: { _all: true },
      }),
      this.scopedPrisma.gradeSubmission.groupBy({
        by: ['status'],
        where: { assessmentId: assessment.id },
        _count: { _all: true },
      }),
    ]);

    return {
      assessment,
      itemStatusCounts: new Map(
        itemStatusRows.map((row) => [row.status, row._count._all]),
      ),
      submissionStatusCounts: new Map(
        submissionStatusRows.map((row) => [row.status, row._count._all]),
      ),
    };
  }

  async getGradebook(params: {
    allocation: TeacherAppAllocationRecord;
    filters?: GetTeacherClassroomGradebookQueryDto;
  }): Promise<TeacherClassroomGradebookResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_GRADEBOOK_LIMIT);
    const page = resolvePage(params.filters?.page);
    const academicYearId = requireAllocationAcademicYearId(params.allocation);
    const enrollmentWhere = buildActiveEnrollmentWhere({
      allocation: params.allocation,
      academicYearId,
      studentId: params.filters?.studentId,
    });
    const assessmentWhere = buildAssessmentWhere({
      allocation: params.allocation,
      assessmentId: params.filters?.assessmentId,
    });

    const [total, assessments] = await Promise.all([
      this.scopedPrisma.enrollment.count({ where: enrollmentWhere }),
      this.scopedPrisma.gradeAssessment.findMany({
        where: assessmentWhere,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...ASSESSMENT_CARD_ARGS,
      }),
    ]);

    if (params.filters?.studentId && total === 0) {
      throw new NotFoundDomainException('Student not found in classroom', {
        studentId: params.filters.studentId,
      });
    }

    if (params.filters?.assessmentId && assessments.length === 0) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId: params.filters.assessmentId,
      });
    }

    const enrollments = await this.scopedPrisma.enrollment.findMany({
      where: enrollmentWhere,
      orderBy: [{ enrolledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      skip: (page - 1) * limit,
      ...GRADEBOOK_ENROLLMENT_ARGS,
    });

    const gradeItems =
      assessments.length === 0 || enrollments.length === 0
        ? []
        : await this.scopedPrisma.gradeItem.findMany({
            where: {
              assessmentId: {
                in: assessments.map((assessment) => assessment.id),
              },
              studentId: {
                in: enrollments.map((enrollment) => enrollment.studentId),
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            ...GRADE_ITEM_ARGS,
          });

    return {
      enrollments,
      assessments,
      gradeItems,
      page,
      limit,
      total,
    };
  }

  async listAssignments(params: {
    allocation: TeacherAppAllocationRecord;
    filters?: ListTeacherClassroomAssignmentsQueryDto;
  }): Promise<TeacherClassroomAssignmentsResult> {
    const limit = resolveLimit(params.filters?.limit, DEFAULT_LIST_LIMIT);
    const page = resolvePage(params.filters?.page);
    const where = buildAssessmentWhere({
      allocation: params.allocation,
      filters: {
        status: params.filters?.status,
        search: params.filters?.search,
        type: 'assignment',
      },
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.gradeAssessment.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...ASSESSMENT_CARD_ARGS,
      }),
      this.scopedPrisma.gradeAssessment.count({ where }),
    ]);

    const assessmentIds = items.map((assessment) => assessment.id);
    const [gradedRows, submissionRows] =
      items.length === 0
        ? [[], []]
        : await Promise.all([
            this.scopedPrisma.gradeItem.groupBy({
              by: ['assessmentId'],
              where: {
                ...buildOwnedGradeItemsWhere({
                  allocation: params.allocation,
                  assessmentIds,
                }),
                status: GradeItemStatus.ENTERED,
              },
              _count: { _all: true },
            }),
            this.scopedPrisma.gradeSubmission.groupBy({
              by: ['assessmentId'],
              where: buildAssignmentSubmissionsWhereForAssessmentIds({
                allocation: params.allocation,
                assessmentIds,
              }),
              _count: { _all: true },
            }),
          ]);

    return {
      items,
      gradedCounts: new Map(
        gradedRows.map((row) => [row.assessmentId, row._count._all]),
      ),
      submissionCounts: new Map(
        submissionRows.map((row) => [row.assessmentId, row._count._all]),
      ),
      page,
      limit,
      total,
    };
  }

  async findOwnedAssignmentDetail(params: {
    allocation: TeacherAppAllocationRecord;
    assignmentId: string;
  }): Promise<TeacherClassroomAssignmentDetailResult> {
    const assignment = await this.scopedPrisma.gradeAssessment.findFirst({
      where: buildAssignmentWhere({
        allocation: params.allocation,
        assignmentId: params.assignmentId,
      }),
      ...ASSESSMENT_DETAIL_ARGS,
    });

    if (!assignment) {
      throw new NotFoundDomainException('Grade assignment not found', {
        assignmentId: params.assignmentId,
      });
    }

    const [itemStatusRows, submissionStatusRows] = await Promise.all([
      this.scopedPrisma.gradeItem.groupBy({
        by: ['status'],
        where: buildOwnedGradeItemWhere({
          allocation: params.allocation,
          assessmentId: assignment.id,
        }),
        _count: { _all: true },
      }),
      this.scopedPrisma.gradeSubmission.groupBy({
        by: ['status'],
        where: buildAssignmentSubmissionWhere({
          allocation: params.allocation,
          assignmentId: assignment.id,
        }),
        _count: { _all: true },
      }),
    ]);

    return {
      assignment,
      itemStatusCounts: new Map(
        itemStatusRows.map((row) => [row.status, row._count._all]),
      ),
      submissionStatusCounts: new Map(
        submissionStatusRows.map((row) => [row.status, row._count._all]),
      ),
    };
  }

  async listOwnedAssignmentSubmissions(params: {
    allocation: TeacherAppAllocationRecord;
    assignmentId: string;
    filters?: ListTeacherClassroomAssignmentSubmissionsQueryDto;
  }): Promise<TeacherClassroomAssignmentSubmissionsResult> {
    const assignment = await this.findOwnedAssignmentCardOrThrow({
      allocation: params.allocation,
      assignmentId: params.assignmentId,
    });
    const limit = resolveLimit(params.filters?.limit, DEFAULT_LIST_LIMIT);
    const page = resolvePage(params.filters?.page);
    const where = buildAssignmentSubmissionWhere({
      allocation: params.allocation,
      assignmentId: assignment.id,
      filters: params.filters,
    });

    const [submissions, total] = await Promise.all([
      this.scopedPrisma.gradeSubmission.findMany({
        where,
        orderBy: [
          { submittedAt: 'desc' },
          { startedAt: 'desc' },
          { id: 'asc' },
        ],
        take: limit,
        skip: (page - 1) * limit,
        ...ASSIGNMENT_SUBMISSION_LIST_ARGS,
      }),
      this.scopedPrisma.gradeSubmission.count({ where }),
    ]);

    return {
      assignment,
      submissions,
      page,
      limit,
      total,
    };
  }

  async findOwnedAssignmentSubmissionDetail(params: {
    allocation: TeacherAppAllocationRecord;
    assignmentId: string;
    submissionId: string;
  }): Promise<TeacherClassroomAssignmentSubmissionDetailResult> {
    const assignment = await this.findOwnedAssignmentDetail({
      allocation: params.allocation,
      assignmentId: params.assignmentId,
    });

    const submission = await this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        ...buildAssignmentSubmissionWhere({
          allocation: params.allocation,
          assignmentId: assignment.assignment.id,
        }),
        id: params.submissionId,
      },
      ...ASSIGNMENT_SUBMISSION_DETAIL_ARGS,
    });

    if (!submission) {
      throw new NotFoundDomainException(
        'Grade assignment submission not found',
        {
          assignmentId: params.assignmentId,
          submissionId: params.submissionId,
        },
      );
    }

    return {
      assignment: assignment.assignment,
      submission,
    };
  }

  private async findOwnedAssignmentCardOrThrow(params: {
    allocation: TeacherAppAllocationRecord;
    assignmentId: string;
  }): Promise<TeacherClassroomAssessmentCardRecord> {
    const assignment = await this.scopedPrisma.gradeAssessment.findFirst({
      where: buildAssignmentWhere(params),
      ...ASSESSMENT_CARD_ARGS,
    });

    if (!assignment) {
      throw new NotFoundDomainException('Grade assignment not found', {
        assignmentId: params.assignmentId,
      });
    }

    return assignment;
  }
}

function buildAssignmentWhere(params: {
  allocation: TeacherAppAllocationRecord;
  assignmentId: string;
}): Prisma.GradeAssessmentWhereInput {
  return buildAssessmentWhere({
    allocation: params.allocation,
    assessmentId: params.assignmentId,
    filters: { type: 'assignment' },
  });
}

function buildAssessmentWhere(params: {
  allocation: TeacherAppAllocationRecord;
  filters?: Pick<
    ListTeacherClassroomAssessmentsQueryDto,
    'status' | 'type' | 'search'
  >;
  assessmentId?: string;
}): Prisma.GradeAssessmentWhereInput {
  const search = params.filters?.search?.trim();
  const statusWhere = buildAssessmentStatusWhere(params.filters?.status);

  return {
    termId: params.allocation.termId,
    subjectId: params.allocation.subjectId,
    classroomId: params.allocation.classroomId,
    ...(params.allocation.term?.academicYearId
      ? { academicYearId: params.allocation.term.academicYearId }
      : {}),
    ...(params.assessmentId ? { id: params.assessmentId } : {}),
    ...(params.filters?.type
      ? { type: toCoreAssessmentType(params.filters.type) }
      : {}),
    ...statusWhere,
    ...(search
      ? {
          OR: [
            {
              titleAr: { contains: search, mode: Prisma.QueryMode.insensitive },
            },
            {
              titleEn: { contains: search, mode: Prisma.QueryMode.insensitive },
            },
          ],
        }
      : {}),
  };
}

function buildAssessmentStatusWhere(
  status?: TeacherClassroomAssessmentStatus,
): Prisma.GradeAssessmentWhereInput {
  switch (status) {
    case 'draft':
      return {
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        lockedAt: null,
      };
    case 'published':
      return {
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        lockedAt: null,
      };
    case 'approved':
      return {
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        lockedAt: null,
      };
    case 'locked':
      return { lockedAt: { not: null } };
    case undefined:
      return {};
  }
}

function buildActiveEnrollmentWhere(params: {
  allocation: TeacherAppAllocationRecord;
  academicYearId: string;
  studentId?: string;
}): Prisma.EnrollmentWhereInput {
  return {
    academicYearId: params.academicYearId,
    classroomId: params.allocation.classroomId,
    status: StudentEnrollmentStatus.ACTIVE,
    OR: [{ termId: params.allocation.termId }, { termId: null }],
    ...(params.studentId ? { studentId: params.studentId } : {}),
    student: {
      is: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
    },
  };
}

function buildOwnedGradeItemWhere(params: {
  allocation: TeacherAppAllocationRecord;
  assessmentId: string;
}): Prisma.GradeItemWhereInput {
  return buildOwnedGradeItemsWhere({
    allocation: params.allocation,
    assessmentIds: [params.assessmentId],
  });
}

function buildOwnedGradeItemsWhere(params: {
  allocation: TeacherAppAllocationRecord;
  assessmentIds: string[];
}): Prisma.GradeItemWhereInput {
  return {
    assessmentId: { in: params.assessmentIds },
    student: {
      is: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
        enrollments: {
          some: buildActiveEnrollmentWhere({
            allocation: params.allocation,
            academicYearId: requireAllocationAcademicYearId(params.allocation),
          }),
        },
      },
    },
  };
}

function buildAssignmentSubmissionsWhereForAssessmentIds(params: {
  allocation: TeacherAppAllocationRecord;
  assessmentIds: string[];
}): Prisma.GradeSubmissionWhereInput {
  return {
    assessmentId: { in: params.assessmentIds },
    termId: params.allocation.termId,
    student: {
      is: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      is: buildActiveEnrollmentWhere({
        allocation: params.allocation,
        academicYearId: requireAllocationAcademicYearId(params.allocation),
      }),
    },
  };
}

function buildAssignmentSubmissionWhere(params: {
  allocation: TeacherAppAllocationRecord;
  assignmentId: string;
  filters?: ListTeacherClassroomAssignmentSubmissionsQueryDto;
}): Prisma.GradeSubmissionWhereInput {
  const academicYearId = requireAllocationAcademicYearId(params.allocation);
  const search = params.filters?.search?.trim();
  const studentWhere: Prisma.StudentWhereInput = {
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            {
              firstName: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              lastName: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        }
      : {}),
  };

  return {
    assessmentId: params.assignmentId,
    termId: params.allocation.termId,
    ...(params.filters?.status
      ? { status: toCoreSubmissionStatus(params.filters.status) }
      : {}),
    ...(params.filters?.studentId
      ? { studentId: params.filters.studentId }
      : {}),
    student: { is: studentWhere },
    enrollment: {
      is: buildActiveEnrollmentWhere({
        allocation: params.allocation,
        academicYearId,
        studentId: params.filters?.studentId,
      }),
    },
  };
}

function requireAllocationAcademicYearId(
  allocation: TeacherAppAllocationRecord,
): string {
  const academicYearId = allocation.term?.academicYearId;
  if (!academicYearId) {
    throw new NotFoundDomainException(
      'Teacher App class allocation was not found',
      {
        classId: allocation.id,
        relation: 'term',
      },
    );
  }

  return academicYearId;
}

function toCoreSubmissionStatus(
  status: TeacherClassroomAssignmentSubmissionStatus,
): GradeSubmissionStatus {
  switch (status) {
    case 'in_progress':
      return GradeSubmissionStatus.IN_PROGRESS;
    case 'submitted':
      return GradeSubmissionStatus.SUBMITTED;
    case 'corrected':
      return GradeSubmissionStatus.CORRECTED;
  }
}

function toCoreAssessmentType(
  type: TeacherClassroomAssessmentType,
): GradeAssessmentType {
  switch (type) {
    case 'quiz':
      return GradeAssessmentType.QUIZ;
    case 'month_exam':
      return GradeAssessmentType.MONTH_EXAM;
    case 'midterm':
      return GradeAssessmentType.MIDTERM;
    case 'term_exam':
      return GradeAssessmentType.TERM_EXAM;
    case 'assignment':
      return GradeAssessmentType.ASSIGNMENT;
    case 'final':
      return GradeAssessmentType.FINAL;
    case 'practical':
      return GradeAssessmentType.PRACTICAL;
  }
}

function resolveLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || Number.isNaN(limit)) return defaultLimit;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
