import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CurriculumStatus,
  FileUploadSessionStatus,
  LessonContentPublicationStatus,
  Prisma,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type {
  LessonContentPath,
  LessonContentSuccessfulAuditEntry,
  LessonContentTransactionContext,
} from '../application/lesson-content.unit-of-work';

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
      publicationStatus: true,
      publishedAt: true,
      publishedByUserId: true,
      archivedAt: true,
      archivedByUserId: true,
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

export type ConditionalLessonContentItemUpdateResult =
  | { status: 'updated'; contentItem: LessonContentItemRecord }
  | { status: 'conflict' };

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

  createTransactionContext(
    transaction: Prisma.TransactionClient,
    schoolId: string,
  ): LessonContentTransactionContext {
    const context: LessonContentTransactionContext = {
      lockLessonContentScope: (path) =>
        this.lockLessonContentScope(transaction, schoolId, path),
      getNextSortOrder: (path) =>
        this.getNextSortOrderInTransaction(transaction, schoolId, path),
      lockReadyLearningMediaFile: (input) =>
        this.lockReadyLearningMediaFile(transaction, schoolId, input),
      createContentItem: (data) =>
        this.createContentItemInTransaction(transaction, schoolId, data),
      updateContentItemConditionally: (input) =>
        this.updateContentItemConditionallyInTransaction(
          transaction,
          schoolId,
          input,
        ),
      writeSuccessfulAudit: (entry) =>
        this.writeSuccessfulAudit(transaction, schoolId, entry),
    };

    return Object.freeze(context);
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

  async updateContentItemConditionally(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
    contentItemId: string;
    expectedPublicationStatus: LessonContentPublicationStatus;
    expectedUpdatedAt: Date;
    data: Prisma.LessonContentItemUncheckedUpdateManyInput;
  }): Promise<ConditionalLessonContentItemUpdateResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction((transaction) =>
      this.updateContentItemConditionallyInTransaction(
        transaction,
        schoolId,
        input,
      ),
    );
  }

  private async lockLessonContentScope(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    path: LessonContentPath,
  ): Promise<LessonContentScopeRecord> {
    const curricula = await transaction.$queryRaw<
      Array<{ id: string; status: CurriculumStatus }>
    >(Prisma.sql`
      SELECT "id", "status"
      FROM "curricula"
      WHERE "id" = ${path.curriculumId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "deleted_at" IS NULL
      LIMIT 1
      FOR UPDATE
    `);
    const curriculum = curricula[0] ?? null;
    if (!curriculum) {
      return { curriculum: null, unit: null, lesson: null };
    }

    const units = await transaction.$queryRaw<
      Array<{ id: string; curriculumId: string }>
    >(Prisma.sql`
      SELECT "id", "curriculum_id" AS "curriculumId"
      FROM "curriculum_units"
      WHERE "id" = ${path.unitId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "curriculum_id" = ${path.curriculumId}::uuid
        AND "deleted_at" IS NULL
      LIMIT 1
      FOR UPDATE
    `);
    const unit = units[0] ?? null;
    if (!unit) {
      return { curriculum, unit: null, lesson: null };
    }

    const lessons = await transaction.$queryRaw<
      Array<{ id: string; curriculumId: string; unitId: string }>
    >(Prisma.sql`
      SELECT
        "id",
        "curriculum_id" AS "curriculumId",
        "unit_id" AS "unitId"
      FROM "curriculum_lessons"
      WHERE "id" = ${path.lessonId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "curriculum_id" = ${path.curriculumId}::uuid
        AND "unit_id" = ${path.unitId}::uuid
        AND "deleted_at" IS NULL
      LIMIT 1
      FOR UPDATE
    `);

    return { curriculum, unit, lesson: lessons[0] ?? null };
  }

  private async lockReadyLearningMediaFile(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    input: { fileId: string; organizationId: string; actorId: string },
  ): Promise<
    | { status: 'ready' }
    | { status: 'not_found' }
    | { status: 'not_ready'; uploadStatus: FileUploadSessionStatus }
  > {
    const sessions = await transaction.$queryRaw<
      Array<{
        status: FileUploadSessionStatus;
        finalCleanupClaimedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        "status",
        "final_cleanup_claimed_at" AS "finalCleanupClaimedAt"
      FROM "file_upload_sessions"
      WHERE "file_id" = ${input.fileId}::uuid
        AND "school_id" = ${schoolId}::uuid
        AND "organization_id" = ${input.organizationId}::uuid
        AND "created_by_user_id" = ${input.actorId}::uuid
        AND "purpose" = 'LESSON_CONTENT'
      LIMIT 1
      FOR UPDATE
    `);
    const session = sessions[0];
    if (!session) return { status: 'not_found' };
    if (
      session.status !== FileUploadSessionStatus.READY ||
      session.finalCleanupClaimedAt !== null
    ) {
      return { status: 'not_ready', uploadStatus: session.status };
    }
    const files = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "files"
        WHERE "id" = ${input.fileId}::uuid
          AND "school_id" = ${schoolId}::uuid
          AND "organization_id" = ${input.organizationId}::uuid
          AND "uploader_id" = ${input.actorId}::uuid
          AND "mime_type" IN (
            'application/pdf',
            'text/plain',
            'image/jpeg',
            'image/png',
            'audio/mpeg',
            'audio/mp4',
            'audio/webm',
            'video/mp4',
            'video/webm'
          )
          AND "deleted_at" IS NULL
        LIMIT 1
        FOR UPDATE
      `,
    );
    return files.length === 1 ? { status: 'ready' } : { status: 'not_found' };
  }

  private async getNextSortOrderInTransaction(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    input: LessonContentPath,
  ): Promise<number> {
    const latest = await transaction.lessonContentItem.findFirst({
      where: {
        schoolId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { sortOrder: true },
    });
    return latest ? latest.sortOrder + 1 : 0;
  }

  private createContentItemInTransaction(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    data: Prisma.LessonContentItemUncheckedCreateInput,
  ): Promise<LessonContentItemRecord> {
    if (data.schoolId !== schoolId) {
      throw new Error('Lesson content transaction school mismatch');
    }
    return transaction.lessonContentItem.create({
      data,
      ...LESSON_CONTENT_ITEM_ARGS,
    });
  }

  private async updateContentItemConditionallyInTransaction(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    input: {
      curriculumId: string;
      unitId: string;
      lessonId: string;
      contentItemId: string;
      expectedPublicationStatus: LessonContentPublicationStatus;
      expectedUpdatedAt: Date;
      data: Prisma.LessonContentItemUncheckedUpdateManyInput;
    },
  ): Promise<ConditionalLessonContentItemUpdateResult> {
    const updateResult = await transaction.lessonContentItem.updateMany({
      where: {
        id: input.contentItemId,
        schoolId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
        deletedAt: null,
        publicationStatus: input.expectedPublicationStatus,
        updatedAt: input.expectedUpdatedAt,
      },
      data: input.data,
    });
    if (updateResult.count !== 1) {
      return { status: 'conflict' };
    }

    const contentItem = await transaction.lessonContentItem.findFirst({
      where: {
        id: input.contentItemId,
        schoolId,
        curriculumId: input.curriculumId,
        unitId: input.unitId,
        lessonId: input.lessonId,
      },
      ...LESSON_CONTENT_ITEM_ARGS,
    });
    if (!contentItem) {
      return { status: 'conflict' };
    }

    return { status: 'updated', contentItem };
  }

  private async writeSuccessfulAudit(
    transaction: Prisma.TransactionClient,
    schoolId: string,
    entry: LessonContentSuccessfulAuditEntry,
  ): Promise<void> {
    if (entry.schoolId !== schoolId) {
      throw new Error('Lesson content audit school mismatch');
    }
    await transaction.auditLog.create({
      data: {
        actorId: entry.actorId,
        userType: entry.userType,
        organizationId: entry.organizationId,
        schoolId: entry.schoolId,
        module: 'academics',
        action: entry.action,
        resourceType: 'lesson_content_item',
        resourceId: entry.resourceId,
        outcome: AuditOutcome.SUCCESS,
        before: entry.before
          ? (entry.before as Prisma.InputJsonValue)
          : undefined,
        after: entry.after ? (entry.after as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
