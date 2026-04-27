import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeScopeType,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_READ_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const SUBJECT_READ_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  code: true,
  color: true,
  isActive: true,
} satisfies Prisma.SubjectSelect;

const CLASSROOM_READ_SELECT = {
  id: true,
  sectionId: true,
  nameAr: true,
  nameEn: true,
  section: {
    select: {
      id: true,
      gradeId: true,
      nameAr: true,
      nameEn: true,
      grade: {
        select: {
          id: true,
          stageId: true,
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
} satisfies Prisma.ClassroomSelect;

const ENROLLMENT_READ_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    studentId: true,
    academicYearId: true,
    termId: true,
    classroomId: true,
    status: true,
    enrolledAt: true,
    createdAt: true,
    updatedAt: true,
    student: {
      select: STUDENT_READ_SELECT,
    },
    classroom: {
      select: CLASSROOM_READ_SELECT,
    },
  },
});

const ASSESSMENT_READ_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      subjectId: true,
      scopeType: true,
      scopeKey: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      deliveryMode: true,
      date: true,
      weight: true,
      maxScore: true,
      approvalStatus: true,
      lockedAt: true,
      subject: {
        select: SUBJECT_READ_SELECT,
      },
    },
  });

const GRADE_ITEM_READ_ARGS = Prisma.validator<Prisma.GradeItemDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    termId: true,
    assessmentId: true,
    studentId: true,
    enrollmentId: true,
    score: true,
    status: true,
    comment: true,
    enteredAt: true,
    createdAt: true,
    updatedAt: true,
  },
});

const GRADE_RULE_READ_ARGS = Prisma.validator<Prisma.GradeRuleDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    termId: true,
    scopeType: true,
    scopeKey: true,
    gradeId: true,
    gradingScale: true,
    passMark: true,
    rounding: true,
  },
});

const ACADEMIC_YEAR_READ_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      isActive: true,
    },
  });

const TERM_READ_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    isActive: true,
  },
});

const STAGE_REFERENCE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: { id: true },
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
      select: { stageId: true },
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
            select: { stageId: true },
          },
        },
      },
    },
  });

export type GradesReadStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_READ_SELECT;
}>;
export type GradesReadSubjectRecord = Prisma.SubjectGetPayload<{
  select: typeof SUBJECT_READ_SELECT;
}>;
export type GradesReadEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_READ_ARGS
>;
export type GradesReadAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof ASSESSMENT_READ_ARGS
>;
export type GradesReadGradeItemRecord = Prisma.GradeItemGetPayload<
  typeof GRADE_ITEM_READ_ARGS
>;
export type GradesReadRuleRecord = Prisma.GradeRuleGetPayload<
  typeof GRADE_RULE_READ_ARGS
>;
export type GradesReadAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_READ_ARGS
>;
export type GradesReadTermRecord = Prisma.TermGetPayload<
  typeof TERM_READ_ARGS
>;
export type GradesReadStageReference = Prisma.StageGetPayload<
  typeof STAGE_REFERENCE_ARGS
>;
export type GradesReadGradeReference = Prisma.GradeGetPayload<
  typeof GRADE_REFERENCE_ARGS
>;
export type GradesReadSectionReference = Prisma.SectionGetPayload<
  typeof SECTION_REFERENCE_ARGS
>;
export type GradesReadClassroomReference = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;

export interface GradesReadScope {
  scopeType: GradeScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface GradesReadAssessmentFilters {
  academicYearId: string;
  termId: string;
  subjectId?: string;
  scope: GradesReadScope;
  approvalStatuses?: GradeAssessmentApprovalStatus[];
}

@Injectable()
export class GradesReadModelRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<GradesReadAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_READ_ARGS,
    });
  }

  findTerm(termId: string): Promise<GradesReadTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_READ_ARGS,
    });
  }

  findSubject(subjectId: string): Promise<GradesReadSubjectRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      select: SUBJECT_READ_SELECT,
    });
  }

  findStage(stageId: string): Promise<GradesReadStageReference | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_REFERENCE_ARGS,
    });
  }

  findGrade(gradeId: string): Promise<GradesReadGradeReference | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findSectionWithGrade(
    sectionId: string,
  ): Promise<GradesReadSectionReference | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_REFERENCE_ARGS,
    });
  }

  findClassroomWithGrade(
    classroomId: string,
  ): Promise<GradesReadClassroomReference | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  findStudentById(
    studentId: string,
  ): Promise<GradesReadStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      select: STUDENT_READ_SELECT,
    });
  }

  listEnrollmentsForScope(params: {
    academicYearId: string;
    termId: string;
    scope: GradesReadScope;
    search?: string;
  }): Promise<GradesReadEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.termId }, { termId: null }],
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          ...this.buildStudentSearchWhere(params.search),
        },
        classroom: this.buildScopeClassroomWhere(params.scope),
      },
      orderBy: [
        { classroomId: 'asc' },
        { enrolledAt: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      ...ENROLLMENT_READ_ARGS,
    });
  }

  findActiveEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId: string;
  }): Promise<GradesReadEnrollmentRecord | null> {
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
      orderBy: [{ termId: 'desc' }, { enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_READ_ARGS,
    });
  }

  listAssessmentsForScope(
    params: GradesReadAssessmentFilters,
  ): Promise<GradesReadAssessmentRecord[]> {
    return this.scopedPrisma.gradeAssessment.findMany({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        approvalStatus: {
          in: params.approvalStatuses ?? [
            GradeAssessmentApprovalStatus.PUBLISHED,
            GradeAssessmentApprovalStatus.APPROVED,
          ],
        },
        ...(params.subjectId ? { subjectId: params.subjectId } : {}),
        OR: this.buildCompatibleAssessmentScopeWhere(params.scope),
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...ASSESSMENT_READ_ARGS,
    });
  }

  listGradeItems(params: {
    assessmentIds: string[];
    studentIds: string[];
  }): Promise<GradesReadGradeItemRecord[]> {
    if (params.assessmentIds.length === 0 || params.studentIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.scopedPrisma.gradeItem.findMany({
      where: {
        assessmentId: { in: params.assessmentIds },
        studentId: { in: params.studentIds },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...GRADE_ITEM_READ_ARGS,
    });
  }

  findSchoolRule(params: {
    academicYearId: string;
    termId: string;
    schoolId: string;
  }): Promise<GradesReadRuleRecord | null> {
    return this.findRuleByUniqueScope({
      academicYearId: params.academicYearId,
      termId: params.termId,
      scopeType: GradeScopeType.SCHOOL,
      scopeKey: params.schoolId,
    });
  }

  findGradeRule(params: {
    academicYearId: string;
    termId: string;
    gradeId: string;
  }): Promise<GradesReadRuleRecord | null> {
    return this.findRuleByUniqueScope({
      academicYearId: params.academicYearId,
      termId: params.termId,
      scopeType: GradeScopeType.GRADE,
      scopeKey: params.gradeId,
    });
  }

  findRuleByUniqueScope(params: {
    academicYearId: string;
    termId: string;
    scopeType: GradeScopeType;
    scopeKey: string;
  }): Promise<GradesReadRuleRecord | null> {
    return this.scopedPrisma.gradeRule.findFirst({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        scopeType: params.scopeType,
        scopeKey: params.scopeKey,
      },
      ...GRADE_RULE_READ_ARGS,
    });
  }

  private buildScopeClassroomWhere(
    scope: GradesReadScope,
  ): Prisma.ClassroomWhereInput {
    switch (scope.scopeType) {
      case GradeScopeType.SCHOOL:
        return { deletedAt: null };
      case GradeScopeType.STAGE:
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            grade: {
              deletedAt: null,
              stageId: scope.stageId ?? scope.scopeKey,
            },
          },
        };
      case GradeScopeType.GRADE:
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            gradeId: scope.gradeId ?? scope.scopeKey,
          },
        };
      case GradeScopeType.SECTION:
        return {
          deletedAt: null,
          sectionId: scope.sectionId ?? scope.scopeKey,
        };
      case GradeScopeType.CLASSROOM:
        return {
          deletedAt: null,
          id: scope.classroomId ?? scope.scopeKey,
        };
    }
  }

  private buildCompatibleAssessmentScopeWhere(
    scope: GradesReadScope,
  ): Prisma.GradeAssessmentWhereInput[] {
    const compatible: Prisma.GradeAssessmentWhereInput[] = [
      {
        scopeType: GradeScopeType.SCHOOL,
        scopeKey:
          scope.scopeType === GradeScopeType.SCHOOL
            ? scope.scopeKey
            : undefined,
      },
    ];

    if (scope.stageId) {
      compatible.push({
        scopeType: GradeScopeType.STAGE,
        scopeKey: scope.stageId,
      });
    }

    if (scope.gradeId) {
      compatible.push({
        scopeType: GradeScopeType.GRADE,
        scopeKey: scope.gradeId,
      });
    }

    if (scope.sectionId) {
      compatible.push({
        scopeType: GradeScopeType.SECTION,
        scopeKey: scope.sectionId,
      });
    }

    if (scope.classroomId) {
      compatible.push({
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: scope.classroomId,
      });
    }

    return compatible.map((where) =>
      where.scopeKey ? where : { scopeType: where.scopeType },
    );
  }

  private buildStudentSearchWhere(search?: string): Prisma.StudentWhereInput {
    const normalizedSearch = search?.trim();
    if (!normalizedSearch) return {};

    const parts = normalizedSearch
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) return {};

    return {
      AND: parts.map((part) => ({
        OR: [
          { firstName: { contains: part, mode: Prisma.QueryMode.insensitive } },
          { lastName: { contains: part, mode: Prisma.QueryMode.insensitive } },
        ],
      })),
    };
  }
}
