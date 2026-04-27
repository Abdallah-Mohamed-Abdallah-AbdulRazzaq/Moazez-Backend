import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const SUBJECT_SUMMARY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  code: true,
  color: true,
  isActive: true,
} satisfies Prisma.SubjectSelect;

const GRADE_ASSESSMENT_ARGS =
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
      expectedTimeMinutes: true,
      approvalStatus: true,
      publishedAt: true,
      publishedById: true,
      approvedAt: true,
      approvedById: true,
      lockedAt: true,
      lockedById: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      subject: {
        select: SUBJECT_SUMMARY_SELECT,
      },
    },
  });

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

export type GradeAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof GRADE_ASSESSMENT_ARGS
>;
export type AcademicYearReferenceRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_REFERENCE_ARGS
>;
export type TermReferenceRecord = Prisma.TermGetPayload<
  typeof TERM_REFERENCE_ARGS
>;
export type SubjectReferenceRecord = Prisma.SubjectGetPayload<{
  select: typeof SUBJECT_SUMMARY_SELECT;
}>;
export type StageReferenceRecord = Prisma.StageGetPayload<
  typeof STAGE_REFERENCE_ARGS
>;
export type GradeReferenceRecord = Prisma.GradeGetPayload<
  typeof GRADE_REFERENCE_ARGS
>;
export type SectionWithGradeRecord = Prisma.SectionGetPayload<
  typeof SECTION_REFERENCE_ARGS
>;
export type ClassroomWithGradeRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;

export interface ListGradeAssessmentsFilters {
  academicYearId?: string;
  termId?: string;
  subjectId?: string;
  scopeType?: GradeScopeType;
  scopeKey?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  approvalStatus?: GradeAssessmentApprovalStatus;
  type?: GradeAssessmentType;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface SumAssessmentWeightsParams {
  academicYearId: string;
  termId: string;
  subjectId: string;
  scopeType: GradeScopeType;
  scopeKey: string;
  excludeAssessmentId?: string;
}

export type CreateGradeAssessmentData =
  Prisma.GradeAssessmentUncheckedCreateInput;
export type UpdateGradeAssessmentData =
  Prisma.GradeAssessmentUncheckedUpdateInput;
export type PublishGradeAssessmentData = Pick<
  Prisma.GradeAssessmentUncheckedUpdateInput,
  'approvalStatus' | 'publishedAt' | 'publishedById'
>;
export type ApproveGradeAssessmentData = Pick<
  Prisma.GradeAssessmentUncheckedUpdateInput,
  'approvalStatus' | 'approvedAt' | 'approvedById'
>;
export type LockGradeAssessmentData = Pick<
  Prisma.GradeAssessmentUncheckedUpdateInput,
  'lockedAt' | 'lockedById'
>;

@Injectable()
export class GradesAssessmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listAssessments(
    filters: ListGradeAssessmentsFilters,
  ): Promise<GradeAssessmentRecord[]> {
    return this.scopedPrisma.gradeAssessment.findMany({
      where: this.buildListWhere(filters),
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...GRADE_ASSESSMENT_ARGS,
    });
  }

  findAssessmentById(
    assessmentId: string,
  ): Promise<GradeAssessmentRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: { id: assessmentId },
      ...GRADE_ASSESSMENT_ARGS,
    });
  }

  createAssessment(
    data: CreateGradeAssessmentData,
  ): Promise<GradeAssessmentRecord> {
    return this.scopedPrisma.gradeAssessment.create({
      data,
      ...GRADE_ASSESSMENT_ARGS,
    });
  }

  async updateAssessment(
    assessmentId: string,
    data: UpdateGradeAssessmentData,
  ): Promise<GradeAssessmentRecord> {
    await this.scopedPrisma.gradeAssessment.updateMany({
      where: { id: assessmentId },
      data: data as Prisma.GradeAssessmentUncheckedUpdateManyInput,
    });

    return this.findMutationResult(assessmentId);
  }

  async publishAssessment(
    assessmentId: string,
    data: PublishGradeAssessmentData,
  ): Promise<GradeAssessmentRecord> {
    await this.scopedPrisma.gradeAssessment.updateMany({
      where: { id: assessmentId, deletedAt: null },
      data: data as Prisma.GradeAssessmentUncheckedUpdateManyInput,
    });

    return this.findMutationResult(assessmentId);
  }

  async approveAssessment(
    assessmentId: string,
    data: ApproveGradeAssessmentData,
  ): Promise<GradeAssessmentRecord> {
    await this.scopedPrisma.gradeAssessment.updateMany({
      where: { id: assessmentId, deletedAt: null },
      data: data as Prisma.GradeAssessmentUncheckedUpdateManyInput,
    });

    return this.findMutationResult(assessmentId);
  }

  async lockAssessment(
    assessmentId: string,
    data: LockGradeAssessmentData,
  ): Promise<GradeAssessmentRecord> {
    await this.scopedPrisma.gradeAssessment.updateMany({
      where: { id: assessmentId, deletedAt: null },
      data: data as Prisma.GradeAssessmentUncheckedUpdateManyInput,
    });

    return this.findMutationResult(assessmentId);
  }

  async softDeleteAssessment(
    assessmentId: string,
  ): Promise<GradeAssessmentRecord> {
    await this.scopedPrisma.gradeAssessment.updateMany({
      where: { id: assessmentId },
      data: { deletedAt: new Date() },
    });

    return this.findMutationResult(assessmentId, { includeSoftDeleted: true });
  }

  countGradeItemsForAssessment(assessmentId: string): Promise<number> {
    return this.scopedPrisma.gradeItem.count({
      where: { assessmentId },
    });
  }

  async sumAssessmentWeights(
    params: SumAssessmentWeightsParams,
  ): Promise<number> {
    const result = await this.scopedPrisma.gradeAssessment.aggregate({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        subjectId: params.subjectId,
        scopeType: params.scopeType,
        scopeKey: params.scopeKey,
        ...(params.excludeAssessmentId
          ? { id: { not: params.excludeAssessmentId } }
          : {}),
      },
      _sum: { weight: true },
    });

    return this.decimalToNumber(result._sum.weight);
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<AcademicYearReferenceRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_REFERENCE_ARGS,
    });
  }

  findTerm(termId: string): Promise<TermReferenceRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  findSubject(subjectId: string): Promise<SubjectReferenceRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      select: SUBJECT_SUMMARY_SELECT,
    });
  }

  findStage(stageId: string): Promise<StageReferenceRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_REFERENCE_ARGS,
    });
  }

  findGrade(gradeId: string): Promise<GradeReferenceRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findSectionWithGrade(
    sectionId: string,
  ): Promise<SectionWithGradeRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_REFERENCE_ARGS,
    });
  }

  findClassroomWithGrade(
    classroomId: string,
  ): Promise<ClassroomWithGradeRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  private buildListWhere(
    filters: ListGradeAssessmentsFilters,
  ): Prisma.GradeAssessmentWhereInput {
    const and: Prisma.GradeAssessmentWhereInput[] = [];

    if (filters.dateFrom) {
      and.push({ date: { gte: filters.dateFrom } });
    }

    if (filters.dateTo) {
      and.push({ date: { lte: filters.dateTo } });
    }

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { titleAr: { contains: search, mode: 'insensitive' } },
          { titleEn: { contains: search, mode: 'insensitive' } },
          { subject: { nameAr: { contains: search, mode: 'insensitive' } } },
          { subject: { nameEn: { contains: search, mode: 'insensitive' } } },
          { subject: { code: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    return {
      deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.scopeType ? { scopeType: filters.scopeType } : {}),
      ...(filters.scopeKey ? { scopeKey: filters.scopeKey } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
      ...(filters.approvalStatus
        ? { approvalStatus: filters.approvalStatus }
        : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async findMutationResult(
    assessmentId: string,
    options?: { includeSoftDeleted?: boolean },
  ): Promise<GradeAssessmentRecord> {
    const findAssessment = () =>
      this.scopedPrisma.gradeAssessment.findFirst({
        where: { id: assessmentId },
        ...GRADE_ASSESSMENT_ARGS,
      });

    const assessment = options?.includeSoftDeleted
      ? await withSoftDeleted(findAssessment)
      : await findAssessment();

    if (!assessment) {
      throw new Error('Updated grade assessment was not found');
    }

    return assessment;
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'object' && 'toNumber' in value) {
      return value.toNumber();
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
}
