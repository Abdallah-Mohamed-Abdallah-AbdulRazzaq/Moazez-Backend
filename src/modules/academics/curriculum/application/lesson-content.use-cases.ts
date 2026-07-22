import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonContentItemType,
  LessonContentPublicationStatus,
  Prisma,
} from '@prisma/client';
import { AcademicsScope, requireAcademicsScope } from '../../academics-context';
import {
  CreateLessonContentItemDto,
  ReorderLessonContentItemDto,
  UpdateLessonContentItemDto,
} from '../dto/lesson-content.dto';
import {
  DeleteLessonContentItemResponseDto,
  LessonContentItemResponseDto,
  LessonContentListResponseDto,
} from '../dto/lesson-content-response.dto';
import {
  normalizeCreateLessonContentInput,
  normalizeUpdateLessonContentInput,
} from '../domain/lesson-content-inputs';
import {
  LessonContentFileNotFoundException,
  LessonContentInvalidTypePayloadException,
  LessonContentNotFoundException,
  LessonContentPublicationConflictException,
  LessonContentReadOnlyException,
} from '../domain/lesson-content.exceptions';
import {
  LessonContentItemRecord,
  LessonContentRepository,
  LessonContentScope,
} from '../infrastructure/lesson-content.repository';
import {
  presentLessonContentItem,
  presentLessonContentItems,
} from '../presenters/lesson-content.presenter';
import {
  LessonContentUnitOfWork,
  type LessonContentItemPath,
  type LessonContentPath,
  type LessonContentTransactionContext,
} from './lesson-content.unit-of-work';

type LessonContentPublicationOperation = {
  expectedPublicationStatus: LessonContentPublicationStatus;
  targetPublicationStatus: LessonContentPublicationStatus;
};

const DRAFT_MUTATION: LessonContentPublicationOperation = {
  expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
  targetPublicationStatus: LessonContentPublicationStatus.DRAFT,
};

const PUBLISH_TRANSITION: LessonContentPublicationOperation = {
  expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
  targetPublicationStatus: LessonContentPublicationStatus.PUBLISHED,
};

const UNPUBLISH_TRANSITION: LessonContentPublicationOperation = {
  expectedPublicationStatus: LessonContentPublicationStatus.PUBLISHED,
  targetPublicationStatus: LessonContentPublicationStatus.DRAFT,
};

const ARCHIVE_TRANSITION: LessonContentPublicationOperation = {
  expectedPublicationStatus: LessonContentPublicationStatus.PUBLISHED,
  targetPublicationStatus: LessonContentPublicationStatus.ARCHIVED,
};

@Injectable()
export class ListLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
  ) {}

  async execute(
    path: LessonContentPath,
  ): Promise<LessonContentListResponseDto> {
    requireAcademicsScope();
    await resolveLessonContentScope(this.lessonContentRepository, path);
    const items =
      await this.lessonContentRepository.listLessonContentItems(path);
    return presentLessonContentItems(items);
  }
}

@Injectable()
export class CreateLessonContentUseCase {
  constructor(
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentPath,
    command: CreateLessonContentItemDto,
  ): Promise<LessonContentItemResponseDto> {
    const scope = requireAcademicsScope();

    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      const normalized = normalizeCreateLessonContentInput(command);
      if (command.sortOrder !== undefined)
        assertValidSortOrder(command.sortOrder);
      await ensureFileAvailable(tx, normalized);

      const sortOrder = command.sortOrder ?? (await tx.getNextSortOrder(path));
      assertValidSortOrder(sortOrder);
      const contentItem = await tx.createContentItem({
        schoolId: scope.schoolId,
        curriculumId: path.curriculumId,
        unitId: path.unitId,
        lessonId: path.lessonId,
        type: normalized.type,
        title: normalized.title,
        bodyText: normalized.bodyText,
        url: normalized.url,
        fileId: normalized.fileId,
        sortOrder,
        isRequired: normalized.isRequired,
        estimatedMinutes: normalized.estimatedMinutes,
        metadata: normalized.metadata,
        createdByUserId: scope.actorId,
        updatedByUserId: scope.actorId,
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
        archivedAt: null,
        archivedByUserId: null,
      });

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.create',
        resourceId: contentItem.id,
        after: summarizeLessonContentMutation(contentItem),
      });

      return presentLessonContentItem(contentItem);
    });
  }
}

@Injectable()
export class GetLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
  ) {}

  async execute(
    path: LessonContentItemPath,
  ): Promise<LessonContentItemResponseDto> {
    requireAcademicsScope();
    await resolveLessonContentScope(this.lessonContentRepository, path);
    const contentItem = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );
    return presentLessonContentItem(contentItem);
  }
}

@Injectable()
export class UpdateLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentItemPath,
    command: UpdateLessonContentItemDto,
  ): Promise<LessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const preliminaryScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(preliminaryScope);
    const existing = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );
    assertExpectedPublicationStatus(existing, DRAFT_MUTATION);
    const normalized = normalizeUpdateLessonContentInput(existing, command);

    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      await ensureFileAvailable(tx, normalized);
      const operationAt = nextMutationTimestamp(existing.updatedAt);
      const updated = await updateContentItemConditionallyOrThrow(
        tx,
        path,
        existing,
        DRAFT_MUTATION,
        {
          type: normalized.type,
          title: normalized.title,
          bodyText: normalized.bodyText,
          url: normalized.url,
          fileId: normalized.fileId,
          isRequired: normalized.isRequired,
          estimatedMinutes: normalized.estimatedMinutes,
          metadata: normalized.metadata,
          updatedByUserId: scope.actorId,
          updatedAt: operationAt,
        },
      );

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.update',
        resourceId: updated.id,
        before: summarizeLessonContentMutation(existing),
        after: summarizeLessonContentMutation(updated),
      });

      return presentLessonContentItem(updated);
    });
  }
}

@Injectable()
export class ReorderLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentItemPath,
    command: ReorderLessonContentItemDto,
  ): Promise<LessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const preliminaryScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(preliminaryScope);
    assertValidSortOrder(command.sortOrder);
    const existing = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );
    assertExpectedPublicationStatus(existing, DRAFT_MUTATION);

    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      const operationAt = nextMutationTimestamp(existing.updatedAt);
      const updated = await updateContentItemConditionallyOrThrow(
        tx,
        path,
        existing,
        DRAFT_MUTATION,
        {
          sortOrder: command.sortOrder,
          updatedByUserId: scope.actorId,
          updatedAt: operationAt,
        },
      );

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.reorder',
        resourceId: updated.id,
        before: summarizeLessonContentMutation(existing),
        after: summarizeLessonContentMutation(updated),
      });

      return presentLessonContentItem(updated);
    });
  }
}

@Injectable()
export class DeleteLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentItemPath,
  ): Promise<DeleteLessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const preliminaryScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(preliminaryScope);
    const existing = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );
    assertExpectedPublicationStatus(existing, DRAFT_MUTATION);

    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      const operationAt = nextMutationTimestamp(existing.updatedAt);
      const deleted = await updateContentItemConditionallyOrThrow(
        tx,
        path,
        existing,
        DRAFT_MUTATION,
        {
          deletedAt: operationAt,
          updatedByUserId: scope.actorId,
          updatedAt: operationAt,
        },
      );

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.delete',
        resourceId: existing.id,
        before: summarizeLessonContentMutation(existing),
        after: summarizeLessonContentMutation(deleted),
      });

      return { ok: true };
    });
  }
}

@Injectable()
export class PublishLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentItemPath,
  ): Promise<LessonContentItemResponseDto> {
    const { scope, existing } = await prepareLessonContentTransition(
      this.lessonContentRepository,
      path,
      PUBLISH_TRANSITION,
    );
    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      await ensureFileAvailable(tx, existing);
      const transitionAt = nextMutationTimestamp(existing.updatedAt);
      const published = await updateContentItemConditionallyOrThrow(
        tx,
        path,
        existing,
        PUBLISH_TRANSITION,
        {
          publicationStatus: LessonContentPublicationStatus.PUBLISHED,
          publishedAt: transitionAt,
          publishedByUserId: scope.actorId,
          archivedAt: null,
          archivedByUserId: null,
          updatedByUserId: scope.actorId,
          updatedAt: transitionAt,
        },
      );

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.publish',
        resourceId: published.id,
        before: summarizeLessonContentLifecycle(existing),
        after: summarizeLessonContentLifecycle(published),
      });

      return presentLessonContentItem(published);
    });
  }
}

@Injectable()
export class UnpublishLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentItemPath,
  ): Promise<LessonContentItemResponseDto> {
    const { scope, existing } = await prepareLessonContentTransition(
      this.lessonContentRepository,
      path,
      UNPUBLISH_TRANSITION,
    );
    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      const transitionAt = nextMutationTimestamp(existing.updatedAt);
      const unpublished = await updateContentItemConditionallyOrThrow(
        tx,
        path,
        existing,
        UNPUBLISH_TRANSITION,
        {
          publicationStatus: LessonContentPublicationStatus.DRAFT,
          publishedAt: null,
          publishedByUserId: null,
          archivedAt: null,
          archivedByUserId: null,
          updatedByUserId: scope.actorId,
          updatedAt: transitionAt,
        },
      );

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.unpublish',
        resourceId: unpublished.id,
        before: summarizeLessonContentLifecycle(existing),
        after: summarizeLessonContentLifecycle(unpublished),
      });

      return presentLessonContentItem(unpublished);
    });
  }
}

@Injectable()
export class ArchiveLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly lessonContentUnitOfWork: LessonContentUnitOfWork,
  ) {}

  async execute(
    path: LessonContentItemPath,
  ): Promise<LessonContentItemResponseDto> {
    const { scope, existing } = await prepareLessonContentTransition(
      this.lessonContentRepository,
      path,
      ARCHIVE_TRANSITION,
    );
    return this.lessonContentUnitOfWork.execute(scope.schoolId, async (tx) => {
      const lessonScope = await resolveLockedLessonContentScope(tx, path);
      assertLessonContentMutable(lessonScope);
      const transitionAt = nextMutationTimestamp(existing.updatedAt);
      const archived = await updateContentItemConditionallyOrThrow(
        tx,
        path,
        existing,
        ARCHIVE_TRANSITION,
        {
          publicationStatus: LessonContentPublicationStatus.ARCHIVED,
          archivedAt: transitionAt,
          archivedByUserId: scope.actorId,
          updatedByUserId: scope.actorId,
          updatedAt: transitionAt,
        },
      );

      await recordLessonContentAudit(tx, {
        scope,
        action: 'academics.lesson_content.archive',
        resourceId: archived.id,
        before: summarizeLessonContentLifecycle(existing),
        after: summarizeLessonContentLifecycle(archived),
      });

      return presentLessonContentItem(archived);
    });
  }
}

async function prepareLessonContentTransition(
  repository: LessonContentRepository,
  path: LessonContentItemPath,
  operation: LessonContentPublicationOperation,
): Promise<{ scope: AcademicsScope; existing: LessonContentItemRecord }> {
  const scope = requireAcademicsScope();
  const lessonScope = await resolveLessonContentScope(repository, path);
  assertLessonContentMutable(lessonScope);
  const existing = await findLessonContentItemOrThrow(repository, path);
  assertExpectedPublicationStatus(existing, operation);
  return { scope, existing };
}

async function resolveLessonContentScope(
  repository: LessonContentRepository,
  path: LessonContentPath,
): Promise<LessonContentScope> {
  const scope = await repository.findLessonContentScope(path);
  if (!scope.curriculum || !scope.unit || !scope.lesson) {
    throw new LessonContentNotFoundException();
  }

  if (scope.unit.curriculumId !== path.curriculumId) {
    throw new LessonContentNotFoundException();
  }

  if (
    scope.lesson.curriculumId !== path.curriculumId ||
    scope.lesson.unitId !== path.unitId
  ) {
    throw new LessonContentNotFoundException();
  }

  return {
    curriculumId: scope.curriculum.id,
    unitId: scope.unit.id,
    lessonId: scope.lesson.id,
    curriculumStatus: scope.curriculum.status,
  };
}

async function resolveLockedLessonContentScope(
  transaction: LessonContentTransactionContext,
  path: LessonContentPath,
): Promise<LessonContentScope> {
  const scope = await transaction.lockLessonContentScope(path);
  if (!scope.curriculum || !scope.unit || !scope.lesson) {
    throw new LessonContentNotFoundException();
  }

  return {
    curriculumId: scope.curriculum.id,
    unitId: scope.unit.id,
    lessonId: scope.lesson.id,
    curriculumStatus: scope.curriculum.status,
  };
}

function assertLessonContentMutable(scope: LessonContentScope): void {
  if (scope.curriculumStatus === CurriculumStatus.ARCHIVED) {
    throw new LessonContentReadOnlyException({
      curriculumId: scope.curriculumId,
      unitId: scope.unitId,
      lessonId: scope.lessonId,
      status: scope.curriculumStatus,
    });
  }
}

async function findLessonContentItemOrThrow(
  repository: Pick<LessonContentRepository, 'findLessonContentItemById'>,
  path: LessonContentItemPath,
): Promise<LessonContentItemRecord> {
  const contentItem = await repository.findLessonContentItemById(path);
  if (!contentItem) {
    throw new LessonContentNotFoundException();
  }

  return contentItem;
}

function assertExpectedPublicationStatus(
  contentItem: LessonContentItemRecord,
  operation: LessonContentPublicationOperation,
): void {
  if (contentItem.publicationStatus !== operation.expectedPublicationStatus) {
    throw new LessonContentPublicationConflictException({
      from: contentItem.publicationStatus,
      to: operation.targetPublicationStatus,
    });
  }
}

async function updateContentItemConditionallyOrThrow(
  repository: Pick<
    LessonContentTransactionContext,
    'updateContentItemConditionally'
  >,
  path: LessonContentItemPath,
  existing: LessonContentItemRecord,
  operation: LessonContentPublicationOperation,
  data: Prisma.LessonContentItemUncheckedUpdateManyInput,
): Promise<LessonContentItemRecord> {
  const result = await repository.updateContentItemConditionally({
    ...path,
    expectedPublicationStatus: operation.expectedPublicationStatus,
    expectedUpdatedAt: existing.updatedAt,
    data,
  });
  if (result.status === 'conflict') {
    throw new LessonContentPublicationConflictException({
      from: existing.publicationStatus,
      to: operation.targetPublicationStatus,
    });
  }

  return result.contentItem;
}

function nextMutationTimestamp(previousUpdatedAt: Date): Date {
  return new Date(Math.max(Date.now(), previousUpdatedAt.getTime() + 1));
}

async function ensureFileAvailable(
  transaction: Pick<LessonContentTransactionContext, 'lockLiveFile'>,
  payload: { type: LessonContentItemType; fileId: string | null },
): Promise<void> {
  if (payload.type !== LessonContentItemType.FILE) {
    return;
  }

  if (!payload.fileId) {
    throw new LessonContentInvalidTypePayloadException({
      field: 'fileId',
      type: payload.type,
    });
  }

  const fileIsLive = await transaction.lockLiveFile(payload.fileId);
  if (!fileIsLive) {
    throw new LessonContentFileNotFoundException();
  }
}

function assertValidSortOrder(sortOrder: number): void {
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new LessonContentInvalidTypePayloadException({
      field: 'sortOrder',
      sortOrder,
    });
  }
}

type LessonContentAuditInput = {
  scope: AcademicsScope;
  action: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

function recordLessonContentAudit(
  transaction: Pick<LessonContentTransactionContext, 'writeSuccessfulAudit'>,
  input: LessonContentAuditInput,
): Promise<void> {
  return transaction.writeSuccessfulAudit({
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    action: input.action,
    resourceId: input.resourceId,
    before: input.before,
    after: input.after,
  });
}

function summarizeLessonContentMutation(
  item: LessonContentItemRecord,
): Record<string, unknown> {
  return {
    type: item.type,
    sortOrder: item.sortOrder,
    isRequired: item.isRequired,
    estimatedMinutes: item.estimatedMinutes,
    publicationStatus: item.publicationStatus,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}

function summarizeLessonContentLifecycle(
  item: LessonContentItemRecord,
): Record<string, unknown> {
  return {
    publicationStatus: item.publicationStatus,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
  };
}
