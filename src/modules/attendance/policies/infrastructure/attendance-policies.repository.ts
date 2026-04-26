import { Injectable } from '@nestjs/common';
import { AttendanceScopeType, Prisma } from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { EffectiveScopeCandidate } from '../domain/policy-scope';

const POLICY_ARGS = Prisma.validator<Prisma.AttendancePolicyDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    termId: true,
    scopeType: true,
    scopeKey: true,
    stageId: true,
    gradeId: true,
    sectionId: true,
    classroomId: true,
    nameAr: true,
    nameEn: true,
    descriptionAr: true,
    descriptionEn: true,
    notes: true,
    mode: true,
    dailyComputationStrategy: true,
    requireExcuseAttachment: true,
    allowParentExcuseRequests: true,
    notifyGuardiansOnAbsence: true,
    effectiveFrom: true,
    effectiveTo: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
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

export type AttendancePolicyRecord = Prisma.AttendancePolicyGetPayload<
  typeof POLICY_ARGS
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
export type SectionReferenceRecord = Prisma.SectionGetPayload<
  typeof SECTION_REFERENCE_ARGS
>;
export type ClassroomReferenceRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;

export interface ListAttendancePoliciesFilters {
  academicYearId?: string;
  termId?: string;
  scopeType?: AttendanceScopeType;
  scopeKey?: string;
  scopeId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  isActive?: boolean;
}

export interface AttendancePolicyConflictLookup {
  academicYearId: string;
  termId: string;
  scopeType: AttendanceScopeType;
  scopeKey: string;
  excludeId?: string;
}

export interface AttendancePolicyNameLookup extends AttendancePolicyConflictLookup {
  nameAr?: string;
  nameEn?: string;
}

@Injectable()
export class AttendancePoliciesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  list(
    filters: ListAttendancePoliciesFilters,
  ): Promise<AttendancePolicyRecord[]> {
    return this.scopedPrisma.attendancePolicy.findMany({
      where: this.buildListWhere(filters),
      orderBy: [
        { academicYearId: 'asc' },
        { termId: 'asc' },
        { scopeType: 'asc' },
        { nameEn: 'asc' },
        { nameAr: 'asc' },
      ],
      ...POLICY_ARGS,
    });
  }

  findById(policyId: string): Promise<AttendancePolicyRecord | null> {
    return this.scopedPrisma.attendancePolicy.findFirst({
      where: { id: policyId },
      ...POLICY_ARGS,
    });
  }

  create(
    data: Prisma.AttendancePolicyUncheckedCreateInput,
  ): Promise<AttendancePolicyRecord> {
    return this.scopedPrisma.attendancePolicy.create({
      data,
      ...POLICY_ARGS,
    });
  }

  update(
    policyId: string,
    data: Prisma.AttendancePolicyUncheckedUpdateInput,
  ): Promise<AttendancePolicyRecord> {
    return this.scopedPrisma.attendancePolicy.update({
      where: { id: policyId },
      data,
      ...POLICY_ARGS,
    });
  }

  softDelete(policyId: string): Promise<AttendancePolicyRecord> {
    return this.update(policyId, { deletedAt: new Date() });
  }

  findActiveScopeConflict(
    lookup: AttendancePolicyConflictLookup,
  ): Promise<AttendancePolicyRecord | null> {
    return this.scopedPrisma.attendancePolicy.findFirst({
      where: {
        academicYearId: lookup.academicYearId,
        termId: lookup.termId,
        scopeType: lookup.scopeType,
        scopeKey: lookup.scopeKey,
        isActive: true,
        ...(lookup.excludeId ? { id: { not: lookup.excludeId } } : {}),
      },
      ...POLICY_ARGS,
    });
  }

  async findNameConflicts(
    lookup: AttendancePolicyNameLookup,
  ): Promise<AttendancePolicyRecord[]> {
    const nameFilters: Prisma.AttendancePolicyWhereInput[] = [];
    if (lookup.nameAr) nameFilters.push({ nameAr: lookup.nameAr });
    if (lookup.nameEn) nameFilters.push({ nameEn: lookup.nameEn });
    if (nameFilters.length === 0) return [];

    return withSoftDeleted(() =>
      this.scopedPrisma.attendancePolicy.findMany({
        where: {
          academicYearId: lookup.academicYearId,
          termId: lookup.termId,
          scopeType: lookup.scopeType,
          scopeKey: lookup.scopeKey,
          OR: nameFilters,
          ...(lookup.excludeId ? { id: { not: lookup.excludeId } } : {}),
        },
        ...POLICY_ARGS,
      }),
    );
  }

  findEffectiveCandidates(params: {
    academicYearId: string;
    termId: string;
    candidates: EffectiveScopeCandidate[];
    date?: Date;
  }): Promise<AttendancePolicyRecord[]> {
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
      ...POLICY_ARGS,
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

  private buildListWhere(
    filters: ListAttendancePoliciesFilters,
  ): Prisma.AttendancePolicyWhereInput {
    const where: Prisma.AttendancePolicyWhereInput = {
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
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    };

    if (filters.scopeId) {
      where.OR = [
        { stageId: filters.scopeId },
        { gradeId: filters.scopeId },
        { sectionId: filters.scopeId },
        { classroomId: filters.scopeId },
      ];
    }

    return where;
  }
}
