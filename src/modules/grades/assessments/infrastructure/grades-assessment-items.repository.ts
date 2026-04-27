import { Injectable } from '@nestjs/common';
import {
  GradeItemStatus,
  GradeScopeType,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GradeItemUpsertPayload } from '../domain/grade-item-entry-domain';

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const CLASSROOM_PLACEMENT_SELECT = {
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

const GRADE_ITEM_ENROLLMENT_ARGS =
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
        select: STUDENT_SUMMARY_SELECT,
      },
      classroom: {
        select: CLASSROOM_PLACEMENT_SELECT,
      },
    },
  });

const GRADE_ITEM_RECORD_ARGS = Prisma.validator<Prisma.GradeItemDefaultArgs>()({
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
    enteredById: true,
    enteredAt: true,
    createdAt: true,
    updatedAt: true,
    student: {
      select: STUDENT_SUMMARY_SELECT,
    },
    enrollment: {
      select: GRADE_ITEM_ENROLLMENT_ARGS.select,
    },
  },
});

const GRADE_ASSESSMENT_FOR_ITEMS_ARGS =
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
      deliveryMode: true,
      maxScore: true,
      approvalStatus: true,
      lockedAt: true,
      deletedAt: true,
      term: {
        select: {
          id: true,
          academicYearId: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      },
    },
  });

export type GradeItemStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SUMMARY_SELECT;
}>;
export type GradeItemEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof GRADE_ITEM_ENROLLMENT_ARGS
>;
export type GradeItemRecord = Prisma.GradeItemGetPayload<
  typeof GRADE_ITEM_RECORD_ARGS
>;
export type GradeAssessmentForGradeItemsRecord =
  Prisma.GradeAssessmentGetPayload<typeof GRADE_ASSESSMENT_FOR_ITEMS_ARGS>;

export interface ListAssessmentItemsFilters {
  classroomId?: string;
  sectionId?: string;
  gradeId?: string;
  search?: string;
  status?: GradeItemStatus;
}

@Injectable()
export class GradesAssessmentItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAssessmentForItems(
    assessmentId: string,
  ): Promise<GradeAssessmentForGradeItemsRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: { id: assessmentId },
      ...GRADE_ASSESSMENT_FOR_ITEMS_ARGS,
    });
  }

  listAssessmentItems(params: {
    assessmentId: string;
    filters?: ListAssessmentItemsFilters;
  }): Promise<GradeItemRecord[]> {
    return this.scopedPrisma.gradeItem.findMany({
      where: this.buildGradeItemWhere(params.assessmentId, params.filters),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...GRADE_ITEM_RECORD_ARGS,
    });
  }

  listStudentsInAssessmentScope(params: {
    assessment: GradeAssessmentForGradeItemsRecord;
    filters?: Pick<
      ListAssessmentItemsFilters,
      'classroomId' | 'sectionId' | 'gradeId' | 'search'
    >;
  }): Promise<GradeItemEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        academicYearId: params.assessment.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        OR: [{ termId: params.assessment.termId }, { termId: null }],
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          ...this.buildStudentSearchWhere(params.filters?.search),
        },
        classroom: this.buildAssessmentRosterClassroomWhere(
          params.assessment,
          params.filters,
        ),
      },
      orderBy: [{ classroomId: 'asc' }, { enrolledAt: 'asc' }, { id: 'asc' }],
      ...GRADE_ITEM_ENROLLMENT_ARGS,
    });
  }

  findStudentForGradeEntry(
    studentId: string,
  ): Promise<GradeItemStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  findStudentsForBulkGradeEntry(
    studentIds: string[],
  ): Promise<GradeItemStudentRecord[]> {
    return this.scopedPrisma.student.findMany({
      where: { id: { in: studentIds } },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  findStudentEnrollmentForAssessmentScope(params: {
    assessment: GradeAssessmentForGradeItemsRecord;
    studentId: string;
  }): Promise<GradeItemEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: this.buildEnrollmentScopeWhere({
        assessment: params.assessment,
        studentIds: [params.studentId],
      }),
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...GRADE_ITEM_ENROLLMENT_ARGS,
    });
  }

  findStudentEnrollmentsForAssessmentScope(params: {
    assessment: GradeAssessmentForGradeItemsRecord;
    studentIds: string[];
  }): Promise<GradeItemEnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: this.buildEnrollmentScopeWhere(params),
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...GRADE_ITEM_ENROLLMENT_ARGS,
    });
  }

  findGradeItemByAssessmentAndStudent(params: {
    assessmentId: string;
    studentId: string;
  }): Promise<GradeItemRecord | null> {
    return this.scopedPrisma.gradeItem.findFirst({
      where: {
        assessmentId: params.assessmentId,
        studentId: params.studentId,
      },
      ...GRADE_ITEM_RECORD_ARGS,
    });
  }

  findGradeItemsByAssessmentAndStudents(params: {
    assessmentId: string;
    studentIds: string[];
  }): Promise<GradeItemRecord[]> {
    return this.scopedPrisma.gradeItem.findMany({
      where: {
        assessmentId: params.assessmentId,
        studentId: { in: params.studentIds },
      },
      ...GRADE_ITEM_RECORD_ARGS,
    });
  }

  upsertGradeItem(input: GradeItemUpsertPayload): Promise<GradeItemRecord> {
    return this.scopedPrisma.gradeItem.upsert({
      where: {
        schoolId_assessmentId_studentId: {
          schoolId: input.schoolId,
          assessmentId: input.assessmentId,
          studentId: input.studentId,
        },
      },
      create: this.buildGradeItemCreateInput(input),
      update: this.buildGradeItemUpdateInput(input),
      ...GRADE_ITEM_RECORD_ARGS,
    });
  }

  bulkUpsertGradeItems(
    inputs: GradeItemUpsertPayload[],
  ): Promise<GradeItemRecord[]> {
    return this.scopedPrisma.$transaction(
      inputs.map((input) =>
        this.scopedPrisma.gradeItem.upsert({
          where: {
            schoolId_assessmentId_studentId: {
              schoolId: input.schoolId,
              assessmentId: input.assessmentId,
              studentId: input.studentId,
            },
          },
          create: this.buildGradeItemCreateInput(input),
          update: this.buildGradeItemUpdateInput(input),
          ...GRADE_ITEM_RECORD_ARGS,
        }),
      ),
    );
  }

  private buildGradeItemWhere(
    assessmentId: string,
    filters?: ListAssessmentItemsFilters,
  ): Prisma.GradeItemWhereInput {
    return {
      assessmentId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(this.hasPlacementFilters(filters)
        ? {
            enrollment: {
              classroom: this.buildListFilterClassroomWhere(filters),
            },
          }
        : {}),
      ...(filters?.search
        ? {
            student: this.buildStudentSearchWhere(filters.search),
          }
        : {}),
    };
  }

  private buildEnrollmentScopeWhere(params: {
    assessment: GradeAssessmentForGradeItemsRecord;
    studentIds: string[];
  }): Prisma.EnrollmentWhereInput {
    return {
      academicYearId: params.assessment.academicYearId,
      studentId: { in: params.studentIds },
      status: StudentEnrollmentStatus.ACTIVE,
      OR: [{ termId: params.assessment.termId }, { termId: null }],
      student: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      classroom: this.buildAssessmentRosterClassroomWhere(params.assessment),
    };
  }

  private buildAssessmentRosterClassroomWhere(
    assessment: GradeAssessmentForGradeItemsRecord,
    filters?: Pick<
      ListAssessmentItemsFilters,
      'classroomId' | 'sectionId' | 'gradeId'
    >,
  ): Prisma.ClassroomWhereInput {
    const and: Prisma.ClassroomWhereInput[] = [
      this.buildAssessmentScopeClassroomWhere(assessment),
    ];

    if (this.hasPlacementFilters(filters)) {
      and.push(this.buildListFilterClassroomWhere(filters));
    }

    return { AND: and };
  }

  private buildAssessmentScopeClassroomWhere(
    assessment: GradeAssessmentForGradeItemsRecord,
  ): Prisma.ClassroomWhereInput {
    switch (assessment.scopeType) {
      case GradeScopeType.SCHOOL:
        return { deletedAt: null };
      case GradeScopeType.STAGE:
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            grade: {
              deletedAt: null,
              stageId: assessment.stageId ?? assessment.scopeKey,
            },
          },
        };
      case GradeScopeType.GRADE:
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            gradeId: assessment.gradeId ?? assessment.scopeKey,
          },
        };
      case GradeScopeType.SECTION:
        return {
          deletedAt: null,
          sectionId: assessment.sectionId ?? assessment.scopeKey,
        };
      case GradeScopeType.CLASSROOM:
        return {
          deletedAt: null,
          id: assessment.classroomId ?? assessment.scopeKey,
        };
    }
  }

  private buildListFilterClassroomWhere(
    filters?: Pick<
      ListAssessmentItemsFilters,
      'classroomId' | 'sectionId' | 'gradeId'
    >,
  ): Prisma.ClassroomWhereInput {
    const and: Prisma.ClassroomWhereInput[] = [];

    if (filters?.classroomId) {
      and.push({ id: filters.classroomId });
    }

    if (filters?.sectionId) {
      and.push({ sectionId: filters.sectionId });
    }

    if (filters?.gradeId) {
      and.push({ section: { gradeId: filters.gradeId } });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private buildStudentSearchWhere(search?: string): Prisma.StudentWhereInput {
    const normalizedSearch = search?.trim();
    if (!normalizedSearch) return {};

    return {
      OR: [
        { firstName: { contains: normalizedSearch, mode: 'insensitive' } },
        { lastName: { contains: normalizedSearch, mode: 'insensitive' } },
      ],
    };
  }

  private hasPlacementFilters(
    filters?: Pick<
      ListAssessmentItemsFilters,
      'classroomId' | 'sectionId' | 'gradeId'
    >,
  ): boolean {
    return Boolean(
      filters?.classroomId || filters?.sectionId || filters?.gradeId,
    );
  }

  private buildGradeItemCreateInput(
    input: GradeItemUpsertPayload,
  ): Prisma.GradeItemUncheckedCreateInput {
    return {
      schoolId: input.schoolId,
      termId: input.termId,
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      score: this.toNullableDecimal(input.score),
      status: input.status,
      comment: input.comment,
      enteredById: input.enteredById,
      enteredAt: input.enteredAt,
    };
  }

  private buildGradeItemUpdateInput(
    input: GradeItemUpsertPayload,
  ): Prisma.GradeItemUncheckedUpdateInput {
    return {
      termId: input.termId,
      enrollmentId: input.enrollmentId,
      score: this.toNullableDecimal(input.score),
      status: input.status,
      comment: input.comment,
      enteredById: input.enteredById,
      enteredAt: input.enteredAt,
    };
  }

  private toNullableDecimal(value: number | null): Prisma.Decimal | null {
    return value === null ? null : new Prisma.Decimal(value);
  }
}
