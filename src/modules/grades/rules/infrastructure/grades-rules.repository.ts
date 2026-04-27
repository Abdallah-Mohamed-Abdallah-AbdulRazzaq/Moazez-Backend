import { Injectable } from '@nestjs/common';
import { GradeScopeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const GRADE_RULE_ARGS = Prisma.validator<Prisma.GradeRuleDefaultArgs>()({
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
    createdAt: true,
    updatedAt: true,
  },
});

const ACADEMIC_YEAR_REFERENCE_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      isActive: true,
    },
  });

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
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

export type GradeRuleRecord = Prisma.GradeRuleGetPayload<
  typeof GRADE_RULE_ARGS
>;
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
export type SectionWithGradeRecord = Prisma.SectionGetPayload<
  typeof SECTION_REFERENCE_ARGS
>;
export type ClassroomWithGradeRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;

export interface ListGradeRulesFilters {
  academicYearId?: string;
  termId?: string;
  scopeType?: GradeScopeType;
  scopeKey?: string;
  gradeId?: string;
}

export interface GradeRuleUniqueScope {
  academicYearId: string;
  termId: string;
  scopeType: GradeScopeType;
  scopeKey: string;
}

@Injectable()
export class GradesRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listRules(filters: ListGradeRulesFilters): Promise<GradeRuleRecord[]> {
    return this.scopedPrisma.gradeRule.findMany({
      where: this.buildListWhere(filters),
      orderBy: [
        { academicYearId: 'desc' },
        { termId: 'desc' },
        { scopeType: 'asc' },
        { createdAt: 'desc' },
      ],
      ...GRADE_RULE_ARGS,
    });
  }

  findRuleById(ruleId: string): Promise<GradeRuleRecord | null> {
    return this.scopedPrisma.gradeRule.findFirst({
      where: { id: ruleId },
      ...GRADE_RULE_ARGS,
    });
  }

  findRuleByUniqueScope(
    lookup: GradeRuleUniqueScope,
  ): Promise<GradeRuleRecord | null> {
    return this.scopedPrisma.gradeRule.findFirst({
      where: {
        academicYearId: lookup.academicYearId,
        termId: lookup.termId,
        scopeType: lookup.scopeType,
        scopeKey: lookup.scopeKey,
      },
      ...GRADE_RULE_ARGS,
    });
  }

  findSchoolRule(params: {
    academicYearId: string;
    termId: string;
    schoolId: string;
  }): Promise<GradeRuleRecord | null> {
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
  }): Promise<GradeRuleRecord | null> {
    return this.findRuleByUniqueScope({
      academicYearId: params.academicYearId,
      termId: params.termId,
      scopeType: GradeScopeType.GRADE,
      scopeKey: params.gradeId,
    });
  }

  createRule(
    data: Prisma.GradeRuleUncheckedCreateInput,
  ): Promise<GradeRuleRecord> {
    return this.scopedPrisma.gradeRule.create({
      data,
      ...GRADE_RULE_ARGS,
    });
  }

  async updateRule(
    ruleId: string,
    data: Prisma.GradeRuleUncheckedUpdateInput,
  ): Promise<GradeRuleRecord> {
    await this.scopedPrisma.gradeRule.updateMany({
      where: { id: ruleId },
      data: data as Prisma.GradeRuleUncheckedUpdateManyInput,
    });

    const updated = await this.findRuleById(ruleId);
    if (!updated) {
      throw new Error('Grade rule update failed');
    }

    return updated;
  }

  async upsertRule(data: Prisma.GradeRuleUncheckedCreateInput): Promise<{
    operation: 'create' | 'update';
    previous: GradeRuleRecord | null;
    rule: GradeRuleRecord;
  }> {
    const previous = await this.findRuleByUniqueScope({
      academicYearId: String(data.academicYearId),
      termId: String(data.termId),
      scopeType: data.scopeType as GradeScopeType,
      scopeKey: String(data.scopeKey),
    });

    if (previous) {
      return {
        operation: 'update',
        previous,
        rule: await this.updateRule(previous.id, {
          gradingScale: data.gradingScale,
          passMark: data.passMark,
          rounding: data.rounding,
          gradeId: data.gradeId ?? null,
        }),
      };
    }

    return {
      operation: 'create',
      previous: null,
      rule: await this.createRule(data),
    };
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
    filters: ListGradeRulesFilters,
  ): Prisma.GradeRuleWhereInput {
    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.scopeType ? { scopeType: filters.scopeType } : {}),
      ...(filters.scopeKey ? { scopeKey: filters.scopeKey } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
    };
  }
}
