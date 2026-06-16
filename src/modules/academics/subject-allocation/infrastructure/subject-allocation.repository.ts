import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    nameAr: true,
    nameEn: true,
    isActive: true,
  },
});

const GRADE_REFERENCE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
  },
});

const SUBJECT_REFERENCE_ARGS = Prisma.validator<Prisma.SubjectDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    code: true,
    color: true,
    isActive: true,
  },
});

const SUBJECT_ALLOCATION_ARGS =
  Prisma.validator<Prisma.SubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      gradeId: true,
      subjectId: true,
      weeklyHours: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      grade: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
          color: true,
        },
      },
    },
  });

export type SubjectAllocationTermReferenceRecord = Prisma.TermGetPayload<
  typeof TERM_REFERENCE_ARGS
>;
export type SubjectAllocationGradeReferenceRecord = Prisma.GradeGetPayload<
  typeof GRADE_REFERENCE_ARGS
>;
export type SubjectAllocationSubjectReferenceRecord = Prisma.SubjectGetPayload<
  typeof SUBJECT_REFERENCE_ARGS
>;
export type SubjectAllocationRecord = Prisma.SubjectAllocationGetPayload<
  typeof SUBJECT_ALLOCATION_ARGS
>;

export interface BulkSaveSubjectAllocationInput {
  schoolId: string;
  academicYearId: string;
  termId: string;
  items: Array<{
    gradeId: string;
    subjectId: string;
    weeklyHours: number;
  }>;
}

@Injectable()
export class SubjectAllocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'SubjectAllocationRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  listAllocations(filters: {
    termId: string;
    gradeId?: string;
    subjectId?: string;
  }): Promise<SubjectAllocationRecord[]> {
    return this.scopedPrisma.subjectAllocation.findMany({
      where: {
        termId: filters.termId,
        ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        grade: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
        term: { is: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...SUBJECT_ALLOCATION_ARGS,
    });
  }

  findTermById(
    termId: string,
  ): Promise<SubjectAllocationTermReferenceRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  findGradesByIds(
    gradeIds: string[],
  ): Promise<SubjectAllocationGradeReferenceRecord[]> {
    if (gradeIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.grade.findMany({
      where: { id: { in: gradeIds } },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findSubjectsByIds(
    subjectIds: string[],
  ): Promise<SubjectAllocationSubjectReferenceRecord[]> {
    if (subjectIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.subject.findMany({
      where: { id: { in: subjectIds } },
      ...SUBJECT_REFERENCE_ARGS,
    });
  }

  async bulkSaveAllocations(
    input: BulkSaveSubjectAllocationInput,
  ): Promise<SubjectAllocationRecord[]> {
    const schoolId = this.getCurrentSchoolId();
    const affectedIds: string[] = [];

    return this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        const existing = await tx.subjectAllocation.findFirst({
          where: {
            schoolId,
            termId: input.termId,
            gradeId: item.gradeId,
            subjectId: item.subjectId,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          const updated = await tx.subjectAllocation.update({
            where: {
              id_schoolId: {
                id: existing.id,
                schoolId,
              },
            },
            data: {
              academicYearId: input.academicYearId,
              weeklyHours: item.weeklyHours,
              deletedAt: null,
            },
            select: {
              id: true,
            },
          });
          affectedIds.push(updated.id);
          continue;
        }

        const created = await tx.subjectAllocation.create({
          data: {
            schoolId,
            academicYearId: input.academicYearId,
            termId: input.termId,
            gradeId: item.gradeId,
            subjectId: item.subjectId,
            weeklyHours: item.weeklyHours,
          },
          select: {
            id: true,
          },
        });
        affectedIds.push(created.id);
      }

      const records = await tx.subjectAllocation.findMany({
        where: {
          schoolId,
          id: { in: affectedIds },
          deletedAt: null,
          grade: { is: { deletedAt: null } },
          subject: { is: { deletedAt: null } },
        },
        ...SUBJECT_ALLOCATION_ARGS,
      });
      const byId = new Map(records.map((record) => [record.id, record]));

      return affectedIds
        .map((id) => byId.get(id))
        .filter((record): record is SubjectAllocationRecord => Boolean(record));
    });
  }
}
