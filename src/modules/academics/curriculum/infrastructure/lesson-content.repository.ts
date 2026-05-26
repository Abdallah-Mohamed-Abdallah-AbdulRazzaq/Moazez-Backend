import { Injectable } from '@nestjs/common';
import { CurriculumStatus, Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const LESSON_CONTENT_FILE_SELECT = {
  select: {
    id: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
  },
} satisfies Prisma.FileDefaultArgs;

const LESSON_CONTENT_ITEM_ARGS =
  Prisma.validator<Prisma.LessonContentItemDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      curriculumId: true,
      unitId: true,
      lessonId: true,
      type: true,
      title: true,
      bodyText: true,
      url: true,
      fileId: true,
      sortOrder: true,
      isRequired: true,
      estimatedMinutes: true,
      metadata: true,
      createdByUserId: true,
      updatedByUserId: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      file: LESSON_CONTENT_FILE_SELECT,
    },
  });

const CURRICULUM_SCOPE_ARGS = Prisma.validator<Prisma.CurriculumDefaultArgs>()({
  select: {
    id: true,
    status: true,
  },
});

const UNIT_SCOPE_ARGS = Prisma.validator<Prisma.CurriculumUnitDefaultArgs>()({
  select: {
    id: true,
    curriculumId: true,
  },
});

const LESSON_SCOPE_ARGS =
  Prisma.validator<Prisma.CurriculumLessonDefaultArgs>()({
    select: {
      id: true,
      curriculumId: true,
      unitId: true,
    },
  });

const FILE_SUMMARY_ARGS = Prisma.validator<Prisma.FileDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    deletedAt: true,
  },
});

export type LessonContentItemRecord = Prisma.LessonContentItemGetPayload<
  typeof LESSON_CONTENT_ITEM_ARGS
>;
export type LessonContentFileRecord = Prisma.FileGetPayload<
  typeof FILE_SUMMARY_ARGS
>;

export type LessonContentScopeRecord = {
  curriculum: Prisma.CurriculumGetPayload<typeof CURRICULUM_SCOPE_ARGS> | null;
  unit: Prisma.CurriculumUnitGetPayload<typeof UNIT_SCOPE_ARGS> | null;
  lesson: Prisma.CurriculumLessonGetPayload<typeof LESSON_SCOPE_ARGS> | null;
};

export type LessonContentScope = {
  curriculumId: string;
  unitId: string;
  lessonId: string;
  curriculumStatus: CurriculumStatus;
};

export type SoftDeleteLessonContentItemResult =
  | { status: 'deleted'; contentItem: LessonContentItemRecord }
  | { status: 'not_found' };

@Injectable()
export class LessonContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'LessonContentRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  async findLessonContentScope(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
  }): Promise<LessonContentScopeRecord> {
    const [curriculum, unit, lesson] = await Promise.all([
      this.scopedPrisma.curriculum.findFirst({
        where: { id: input.curriculumId },
        ...CURRICULUM_SCOPE_ARGS,
      }),
      this.scopedPrisma.curriculumUnit.findFirst({
        where: { id: input.unitId },
        ...UNIT_SCOPE_ARGS,
      }),
      this.scopedPrisma.curriculumLesson.findFirst({
        where: { id: input.lessonId },
        ...LESSON_SCOPE_ARGS,
      }),
    ]);

    return { curriculum, unit, lesson };
  }

  listLessonContentItems(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
  }): Promise<LessonContentItemRecord[]> {
    return this.scopedPrisma.lessonContentItem.findMany({
      where: {
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...LESSON_CONTENT_ITEM_ARGS,
    });
  }

  findLessonContentItemById(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
    contentItemId: string;
  }): Promise<LessonContentItemRecord | null> {
    return this.scopedPrisma.lessonContentItem.findFirst({
      where: {
        id: input.contentItemId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
      },
      ...LESSON_CONTENT_ITEM_ARGS,
    });
  }

  async getNextSortOrder(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
  }): Promise<number> {
    const latest = await this.scopedPrisma.lessonContentItem.findFirst({
      where: {
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
      },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { sortOrder: true },
    });

    return latest ? latest.sortOrder + 1 : 0;
  }

  findFileById(fileId: string): Promise<LessonContentFileRecord | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      ...FILE_SUMMARY_ARGS,
    });
  }

  createContentItem(
    data: Prisma.LessonContentItemUncheckedCreateInput,
  ): Promise<LessonContentItemRecord> {
    return this.scopedPrisma.lessonContentItem.create({
      data,
      ...LESSON_CONTENT_ITEM_ARGS,
    });
  }

  updateContentItem(
    contentItemId: string,
    data: Prisma.LessonContentItemUncheckedUpdateInput,
  ): Promise<LessonContentItemRecord> {
    return this.scopedPrisma.lessonContentItem.update({
      where: { id: contentItemId },
      data,
      ...LESSON_CONTENT_ITEM_ARGS,
    });
  }

  reorderContentItem(
    contentItemId: string,
    sortOrder: number,
  ): Promise<LessonContentItemRecord> {
    return this.updateContentItem(contentItemId, { sortOrder });
  }

  async softDeleteContentItem(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
    contentItemId: string;
  }): Promise<SoftDeleteLessonContentItemResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonContentItem.findFirst({
        where: {
          id: input.contentItemId,
          schoolId,
          curriculumId: input.curriculumId,
          unitId: input.unitId,
          lessonId: input.lessonId,
          deletedAt: null,
        },
        ...LESSON_CONTENT_ITEM_ARGS,
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      const contentItem = await tx.lessonContentItem.update({
        where: {
          id_schoolId: {
            id: input.contentItemId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
        ...LESSON_CONTENT_ITEM_ARGS,
      });

      return { status: 'deleted', contentItem };
    });
  }
}
