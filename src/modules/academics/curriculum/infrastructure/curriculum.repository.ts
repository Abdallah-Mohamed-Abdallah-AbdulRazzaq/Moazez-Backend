import { Injectable } from '@nestjs/common';
import { CurriculumStatus, Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
  },
});

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    nameAr: true,
    nameEn: true,
  },
});

const GRADE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
  },
});

const SUBJECT_ARGS = Prisma.validator<Prisma.SubjectDefaultArgs>()({
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

const CURRICULUM_RELATION_SUMMARIES = {
  academicYear: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
    },
  },
  term: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
    },
  },
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
} satisfies Prisma.CurriculumSelect;

const CURRICULUM_LIST_ARGS = Prisma.validator<Prisma.CurriculumDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    termId: true,
    gradeId: true,
    subjectId: true,
    title: true,
    description: true,
    status: true,
    createdByUserId: true,
    updatedByUserId: true,
    publishedAt: true,
    archivedAt: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    ...CURRICULUM_RELATION_SUMMARIES,
    units: {
      where: { deletedAt: null },
      select: { id: true },
    },
    lessons: {
      where: { deletedAt: null },
      select: { id: true },
    },
  },
});

const CURRICULUM_LESSON_ARGS =
  Prisma.validator<Prisma.CurriculumLessonDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      curriculumId: true,
      unitId: true,
      title: true,
      description: true,
      objectives: true,
      sortOrder: true,
      estimatedMinutes: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const CURRICULUM_UNIT_ARGS =
  Prisma.validator<Prisma.CurriculumUnitDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      curriculumId: true,
      title: true,
      description: true,
      sortOrder: true,
      estimatedLessons: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      lessons: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...CURRICULUM_LESSON_ARGS,
      },
    },
  });

const CURRICULUM_DETAIL_ARGS = Prisma.validator<Prisma.CurriculumDefaultArgs>()(
  {
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      gradeId: true,
      subjectId: true,
      title: true,
      description: true,
      status: true,
      createdByUserId: true,
      updatedByUserId: true,
      publishedAt: true,
      archivedAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      ...CURRICULUM_RELATION_SUMMARIES,
      units: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...CURRICULUM_UNIT_ARGS,
      },
      lessons: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  },
);

export type CurriculumAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type CurriculumTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type CurriculumGradeRecord = Prisma.GradeGetPayload<typeof GRADE_ARGS>;
export type CurriculumSubjectRecord = Prisma.SubjectGetPayload<
  typeof SUBJECT_ARGS
>;
export type CurriculumListRecord = Prisma.CurriculumGetPayload<
  typeof CURRICULUM_LIST_ARGS
>;
export type CurriculumDetailRecord = Prisma.CurriculumGetPayload<
  typeof CURRICULUM_DETAIL_ARGS
>;
export type CurriculumUnitRecord = Prisma.CurriculumUnitGetPayload<
  typeof CURRICULUM_UNIT_ARGS
>;
export type CurriculumLessonRecord = Prisma.CurriculumLessonGetPayload<
  typeof CURRICULUM_LESSON_ARGS
>;

export interface ListCurriculaFilters {
  academicYearId?: string;
  termId?: string;
  gradeId?: string;
  subjectId?: string;
  status?: CurriculumStatus;
  search?: string;
}

export type SoftDeleteCurriculumResult =
  | { status: 'deleted'; curriculum: CurriculumDetailRecord }
  | { status: 'not_found' };

export type SoftDeleteUnitResult =
  | { status: 'deleted'; unit: CurriculumUnitRecord }
  | { status: 'not_found' };

export type SoftDeleteLessonResult =
  | { status: 'deleted'; lesson: CurriculumLessonRecord }
  | { status: 'not_found' };

@Injectable()
export class CurriculumRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'CurriculumRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<CurriculumAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTermById(termId: string): Promise<CurriculumTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findGradeById(gradeId: string): Promise<CurriculumGradeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_ARGS,
    });
  }

  findSubjectById(subjectId: string): Promise<CurriculumSubjectRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      ...SUBJECT_ARGS,
    });
  }

  listCurricula(
    filters: ListCurriculaFilters,
  ): Promise<CurriculumListRecord[]> {
    const search = filters.search?.trim();

    return this.scopedPrisma.curriculum.findMany({
      where: {
        ...(filters.academicYearId
          ? { academicYearId: filters.academicYearId }
          : {}),
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...CURRICULUM_LIST_ARGS,
    });
  }

  findCurriculumById(
    curriculumId: string,
  ): Promise<CurriculumDetailRecord | null> {
    return this.scopedPrisma.curriculum.findFirst({
      where: { id: curriculumId },
      ...CURRICULUM_DETAIL_ARGS,
    });
  }

  findCurriculumByScope(input: {
    academicYearId: string;
    termId: string;
    gradeId: string;
    subjectId: string;
  }): Promise<CurriculumListRecord | null> {
    return this.scopedPrisma.curriculum.findFirst({
      where: input,
      ...CURRICULUM_LIST_ARGS,
    });
  }

  createCurriculum(
    data: Prisma.CurriculumUncheckedCreateInput,
  ): Promise<CurriculumDetailRecord> {
    return this.scopedPrisma.curriculum.create({
      data,
      ...CURRICULUM_DETAIL_ARGS,
    });
  }

  updateCurriculum(
    curriculumId: string,
    data: Prisma.CurriculumUncheckedUpdateInput,
  ): Promise<CurriculumDetailRecord> {
    return this.scopedPrisma.curriculum.update({
      where: { id: curriculumId },
      data,
      ...CURRICULUM_DETAIL_ARGS,
    });
  }

  async countActiveUnitsAndLessons(curriculumId: string): Promise<{
    unitsCount: number;
    lessonsCount: number;
  }> {
    const [unitsCount, lessonsCount] = await Promise.all([
      this.scopedPrisma.curriculumUnit.count({
        where: { curriculumId },
      }),
      this.scopedPrisma.curriculumLesson.count({
        where: { curriculumId },
      }),
    ]);

    return { unitsCount, lessonsCount };
  }

  async softDeleteCurriculum(
    curriculumId: string,
  ): Promise<SoftDeleteCurriculumResult> {
    const schoolId = this.getCurrentSchoolId();
    const deletedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.curriculum.findFirst({
        where: { id: curriculumId, schoolId, deletedAt: null },
        ...CURRICULUM_DETAIL_ARGS,
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      await tx.lessonContentItem.updateMany({
        where: { curriculumId, schoolId, deletedAt: null },
        data: { deletedAt },
      });
      await tx.curriculumLesson.updateMany({
        where: { curriculumId, schoolId, deletedAt: null },
        data: { deletedAt },
      });
      await tx.curriculumUnit.updateMany({
        where: { curriculumId, schoolId, deletedAt: null },
        data: { deletedAt },
      });
      const curriculum = await tx.curriculum.update({
        where: {
          id_schoolId: {
            id: curriculumId,
            schoolId,
          },
        },
        data: { deletedAt },
        ...CURRICULUM_DETAIL_ARGS,
      });

      return { status: 'deleted', curriculum };
    });
  }

  findUnitById(input: {
    curriculumId: string;
    unitId: string;
  }): Promise<CurriculumUnitRecord | null> {
    return this.scopedPrisma.curriculumUnit.findFirst({
      where: {
        id: input.unitId,
        curriculumId: input.curriculumId,
      },
      ...CURRICULUM_UNIT_ARGS,
    });
  }

  async getNextUnitSortOrder(curriculumId: string): Promise<number> {
    const latest = await this.scopedPrisma.curriculumUnit.findFirst({
      where: { curriculumId },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { sortOrder: true },
    });

    return latest ? latest.sortOrder + 1 : 0;
  }

  createUnit(
    data: Prisma.CurriculumUnitUncheckedCreateInput,
  ): Promise<CurriculumUnitRecord> {
    return this.scopedPrisma.curriculumUnit.create({
      data,
      ...CURRICULUM_UNIT_ARGS,
    });
  }

  updateUnit(
    unitId: string,
    data: Prisma.CurriculumUnitUncheckedUpdateInput,
  ): Promise<CurriculumUnitRecord> {
    return this.scopedPrisma.curriculumUnit.update({
      where: { id: unitId },
      data,
      ...CURRICULUM_UNIT_ARGS,
    });
  }

  async softDeleteUnit(input: {
    curriculumId: string;
    unitId: string;
  }): Promise<SoftDeleteUnitResult> {
    const schoolId = this.getCurrentSchoolId();
    const deletedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.curriculumUnit.findFirst({
        where: {
          id: input.unitId,
          curriculumId: input.curriculumId,
          schoolId,
          deletedAt: null,
        },
        ...CURRICULUM_UNIT_ARGS,
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      await tx.lessonContentItem.updateMany({
        where: {
          unitId: input.unitId,
          curriculumId: input.curriculumId,
          schoolId,
          deletedAt: null,
        },
        data: { deletedAt },
      });
      await tx.curriculumLesson.updateMany({
        where: {
          unitId: input.unitId,
          curriculumId: input.curriculumId,
          schoolId,
          deletedAt: null,
        },
        data: { deletedAt },
      });
      const unit = await tx.curriculumUnit.update({
        where: {
          id_schoolId: {
            id: input.unitId,
            schoolId,
          },
        },
        data: { deletedAt },
        ...CURRICULUM_UNIT_ARGS,
      });

      return { status: 'deleted', unit };
    });
  }

  findLessonById(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
  }): Promise<CurriculumLessonRecord | null> {
    return this.scopedPrisma.curriculumLesson.findFirst({
      where: {
        id: input.lessonId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
      },
      ...CURRICULUM_LESSON_ARGS,
    });
  }

  async getNextLessonSortOrder(input: {
    curriculumId: string;
    unitId: string;
  }): Promise<number> {
    const latest = await this.scopedPrisma.curriculumLesson.findFirst({
      where: {
        curriculumId: input.curriculumId,
        unitId: input.unitId,
      },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { sortOrder: true },
    });

    return latest ? latest.sortOrder + 1 : 0;
  }

  createLesson(
    data: Prisma.CurriculumLessonUncheckedCreateInput,
  ): Promise<CurriculumLessonRecord> {
    return this.scopedPrisma.curriculumLesson.create({
      data,
      ...CURRICULUM_LESSON_ARGS,
    });
  }

  updateLesson(
    lessonId: string,
    data: Prisma.CurriculumLessonUncheckedUpdateInput,
  ): Promise<CurriculumLessonRecord> {
    return this.scopedPrisma.curriculumLesson.update({
      where: { id: lessonId },
      data,
      ...CURRICULUM_LESSON_ARGS,
    });
  }

  async softDeleteLesson(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
  }): Promise<SoftDeleteLessonResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.curriculumLesson.findFirst({
        where: {
          id: input.lessonId,
          curriculumId: input.curriculumId,
          unitId: input.unitId,
          schoolId,
          deletedAt: null,
        },
        ...CURRICULUM_LESSON_ARGS,
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      const deletedAt = new Date();
      await tx.lessonContentItem.updateMany({
        where: {
          lessonId: input.lessonId,
          unitId: input.unitId,
          curriculumId: input.curriculumId,
          schoolId,
          deletedAt: null,
        },
        data: { deletedAt },
      });
      const lesson = await tx.curriculumLesson.update({
        where: {
          id_schoolId: {
            id: input.lessonId,
            schoolId,
          },
        },
        data: { deletedAt },
        ...CURRICULUM_LESSON_ARGS,
      });

      return { status: 'deleted', lesson };
    });
  }
}
