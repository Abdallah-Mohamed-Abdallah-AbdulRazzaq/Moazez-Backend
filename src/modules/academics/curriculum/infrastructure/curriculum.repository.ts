import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonContentPublicationStatus,
  Prisma,
} from '@prisma/client';
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
  | { status: 'publication_conflict' }
  | { status: 'not_found' };

export type SoftDeleteUnitResult =
  | { status: 'deleted'; unit: CurriculumUnitRecord }
  | { status: 'publication_conflict' }
  | { status: 'read_only'; curriculumStatus: CurriculumStatus }
  | { status: 'not_found' };

export type SoftDeleteLessonResult =
  | { status: 'deleted'; lesson: CurriculumLessonRecord }
  | { status: 'publication_conflict' }
  | { status: 'read_only'; curriculumStatus: CurriculumStatus }
  | { status: 'not_found' };

type LockedCurriculumRow = {
  id: string;
  status: CurriculumStatus;
};

type LockedLessonContentRow = {
  id: string;
  publicationStatus: LessonContentPublicationStatus;
};

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
      const curriculum = await this.lockLiveCurriculum(
        tx,
        schoolId,
        curriculumId,
      );
      if (!curriculum) {
        return { status: 'not_found' };
      }

      await this.lockLiveCurriculumUnits(tx, schoolId, curriculumId);
      await this.lockLiveCurriculumLessons(tx, schoolId, curriculumId);
      const contentItems = await this.lockLiveLessonContentItems(tx, {
        schoolId,
        curriculumId,
      });
      if (this.hasPublishedContent(contentItems)) {
        return { status: 'publication_conflict' };
      }

      await tx.lessonContentItem.updateMany({
        where: {
          curriculumId,
          schoolId,
          deletedAt: null,
          publicationStatus: LessonContentPublicationStatus.DRAFT,
        },
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
      const deletedCurriculum = await tx.curriculum.update({
        where: {
          id_schoolId: {
            id: curriculumId,
            schoolId,
          },
        },
        data: { deletedAt },
        ...CURRICULUM_DETAIL_ARGS,
      });

      return { status: 'deleted', curriculum: deletedCurriculum };
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
      const curriculum = await this.lockLiveCurriculum(
        tx,
        schoolId,
        input.curriculumId,
      );
      if (!curriculum) {
        return { status: 'not_found' };
      }
      if (curriculum.status === CurriculumStatus.ARCHIVED) {
        return {
          status: 'read_only',
          curriculumStatus: curriculum.status,
        };
      }

      const unit = await this.lockLiveCurriculumUnit(tx, schoolId, input);
      if (!unit) {
        return { status: 'not_found' };
      }

      await this.lockLiveUnitLessons(tx, schoolId, input);
      const contentItems = await this.lockLiveLessonContentItems(tx, {
        schoolId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
      });
      if (this.hasPublishedContent(contentItems)) {
        return { status: 'publication_conflict' };
      }

      await tx.lessonContentItem.updateMany({
        where: {
          unitId: input.unitId,
          curriculumId: input.curriculumId,
          schoolId,
          deletedAt: null,
          publicationStatus: LessonContentPublicationStatus.DRAFT,
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
      const deletedUnit = await tx.curriculumUnit.update({
        where: {
          id_schoolId: {
            id: input.unitId,
            schoolId,
          },
        },
        data: { deletedAt },
        ...CURRICULUM_UNIT_ARGS,
      });

      return { status: 'deleted', unit: deletedUnit };
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
      const curriculum = await this.lockLiveCurriculum(
        tx,
        schoolId,
        input.curriculumId,
      );
      if (!curriculum) {
        return { status: 'not_found' };
      }
      if (curriculum.status === CurriculumStatus.ARCHIVED) {
        return {
          status: 'read_only',
          curriculumStatus: curriculum.status,
        };
      }

      const unit = await this.lockLiveCurriculumUnit(tx, schoolId, input);
      if (!unit) {
        return { status: 'not_found' };
      }

      const lesson = await this.lockLiveCurriculumLesson(tx, schoolId, input);
      if (!lesson) {
        return { status: 'not_found' };
      }

      const deletedAt = new Date();
      const contentItems = await this.lockLiveLessonContentItems(tx, {
        schoolId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
      });
      if (this.hasPublishedContent(contentItems)) {
        return { status: 'publication_conflict' };
      }

      await tx.lessonContentItem.updateMany({
        where: {
          lessonId: input.lessonId,
          unitId: input.unitId,
          curriculumId: input.curriculumId,
          schoolId,
          deletedAt: null,
          publicationStatus: LessonContentPublicationStatus.DRAFT,
        },
        data: { deletedAt },
      });
      const deletedLesson = await tx.curriculumLesson.update({
        where: {
          id_schoolId: {
            id: input.lessonId,
            schoolId,
          },
        },
        data: { deletedAt },
        ...CURRICULUM_LESSON_ARGS,
      });

      return { status: 'deleted', lesson: deletedLesson };
    });
  }

  private async lockLiveCurriculum(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    curriculumId: string,
  ): Promise<LockedCurriculumRow | null> {
    const curricula = await transaction.$queryRaw<LockedCurriculumRow[]>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "curricula"
        WHERE "id" = ${curriculumId}::uuid
          AND "school_id" = ${schoolId}::uuid
          AND "deleted_at" IS NULL
        LIMIT 1
        FOR UPDATE
      `,
    );
    return curricula[0] ?? null;
  }

  private async lockLiveCurriculumUnits(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    curriculumId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "curriculum_units"
      WHERE "school_id" = ${schoolId}::uuid
        AND "curriculum_id" = ${curriculumId}::uuid
        AND "deleted_at" IS NULL
      ORDER BY "id" ASC
      FOR UPDATE
    `);
  }

  private async lockLiveCurriculumLessons(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    curriculumId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "curriculum_lessons"
      WHERE "school_id" = ${schoolId}::uuid
        AND "curriculum_id" = ${curriculumId}::uuid
        AND "deleted_at" IS NULL
      ORDER BY "id" ASC
      FOR UPDATE
    `);
  }

  private async lockLiveCurriculumUnit(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    input: { curriculumId: string; unitId: string },
  ): Promise<{ id: string } | null> {
    const units = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "curriculum_units"
        WHERE "id" = ${input.unitId}::uuid
          AND "school_id" = ${schoolId}::uuid
          AND "curriculum_id" = ${input.curriculumId}::uuid
          AND "deleted_at" IS NULL
        LIMIT 1
        FOR UPDATE
      `,
    );
    return units[0] ?? null;
  }

  private async lockLiveUnitLessons(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    input: { curriculumId: string; unitId: string },
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "curriculum_lessons"
      WHERE "school_id" = ${schoolId}::uuid
        AND "curriculum_id" = ${input.curriculumId}::uuid
        AND "unit_id" = ${input.unitId}::uuid
        AND "deleted_at" IS NULL
      ORDER BY "id" ASC
      FOR UPDATE
    `);
  }

  private async lockLiveCurriculumLesson(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    input: { curriculumId: string; unitId: string; lessonId: string },
  ): Promise<{ id: string } | null> {
    const lessons = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "curriculum_lessons"
        WHERE "id" = ${input.lessonId}::uuid
          AND "school_id" = ${schoolId}::uuid
          AND "curriculum_id" = ${input.curriculumId}::uuid
          AND "unit_id" = ${input.unitId}::uuid
          AND "deleted_at" IS NULL
        LIMIT 1
        FOR UPDATE
      `,
    );
    return lessons[0] ?? null;
  }

  private lockLiveLessonContentItems(
    transaction: Prisma.TransactionClient,
    input: {
      schoolId: string;
      curriculumId: string;
      unitId?: string;
      lessonId?: string;
    },
  ): Promise<LockedLessonContentRow[]> {
    return transaction.$queryRaw<LockedLessonContentRow[]>(Prisma.sql`
      SELECT
        "id",
        "publication_status" AS "publicationStatus"
      FROM "lesson_content_items"
      WHERE "school_id" = ${input.schoolId}::uuid
        AND "curriculum_id" = ${input.curriculumId}::uuid
        ${input.unitId ? Prisma.sql`AND "unit_id" = ${input.unitId}::uuid` : Prisma.empty}
        ${input.lessonId ? Prisma.sql`AND "lesson_id" = ${input.lessonId}::uuid` : Prisma.empty}
        AND "deleted_at" IS NULL
      ORDER BY "id" ASC
      FOR UPDATE
    `);
  }

  private hasPublishedContent(items: LockedLessonContentRow[]): boolean {
    return items.some(
      (item) =>
        item.publicationStatus === LessonContentPublicationStatus.PUBLISHED,
    );
  }
}
