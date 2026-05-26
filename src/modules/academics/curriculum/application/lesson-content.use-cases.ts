import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CurriculumStatus,
  LessonContentItemType,
  Prisma,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
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
  NormalizedLessonContentPayload,
} from '../domain/lesson-content-inputs';
import {
  LessonContentFileNotFoundException,
  LessonContentInvalidScopeException,
  LessonContentInvalidTypePayloadException,
  LessonContentNotFoundException,
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

type LessonContentPath = {
  curriculumId: string;
  unitId: string;
  lessonId: string;
};

type LessonContentItemPath = LessonContentPath & {
  contentItemId: string;
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
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    path: LessonContentPath,
    command: CreateLessonContentItemDto,
  ): Promise<LessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(lessonScope);

    const normalized = normalizeCreateLessonContentInput(command);
    await ensureFileAvailable(this.lessonContentRepository, normalized);

    const sortOrder =
      command.sortOrder ??
      (await this.lessonContentRepository.getNextSortOrder(path));
    assertValidSortOrder(sortOrder);

    const contentItem = await this.lessonContentRepository.createContentItem({
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
    });

    await recordLessonContentAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_content.create',
      resourceId: contentItem.id,
      after: summarizeLessonContentItem(contentItem),
    });

    return presentLessonContentItem(contentItem);
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
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    path: LessonContentItemPath,
    command: UpdateLessonContentItemDto,
  ): Promise<LessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(lessonScope);
    const existing = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );

    const normalized = normalizeUpdateLessonContentInput(existing, command);
    await ensureFileAvailable(this.lessonContentRepository, normalized);

    const updated = await this.lessonContentRepository.updateContentItem(
      path.contentItemId,
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
      },
    );

    await recordLessonContentAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_content.update',
      resourceId: updated.id,
      before: summarizeLessonContentItem(existing),
      after: summarizeLessonContentItem(updated),
    });

    return presentLessonContentItem(updated);
  }
}

@Injectable()
export class ReorderLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    path: LessonContentItemPath,
    command: ReorderLessonContentItemDto,
  ): Promise<LessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(lessonScope);
    assertValidSortOrder(command.sortOrder);
    const existing = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );

    const updated = await this.lessonContentRepository.updateContentItem(
      path.contentItemId,
      {
        sortOrder: command.sortOrder,
        updatedByUserId: scope.actorId,
      },
    );

    await recordLessonContentAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_content.reorder',
      resourceId: updated.id,
      before: summarizeLessonContentItem(existing),
      after: summarizeLessonContentItem(updated),
    });

    return presentLessonContentItem(updated);
  }
}

@Injectable()
export class DeleteLessonContentUseCase {
  constructor(
    private readonly lessonContentRepository: LessonContentRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    path: LessonContentItemPath,
  ): Promise<DeleteLessonContentItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonScope = await resolveLessonContentScope(
      this.lessonContentRepository,
      path,
    );
    assertLessonContentMutable(lessonScope);
    const existing = await findLessonContentItemOrThrow(
      this.lessonContentRepository,
      path,
    );

    const result =
      await this.lessonContentRepository.softDeleteContentItem(path);
    if (result.status === 'not_found') {
      throw new LessonContentNotFoundException(path);
    }

    await recordLessonContentAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_content.delete',
      resourceId: existing.id,
      before: summarizeLessonContentItem(existing),
      after: summarizeLessonContentItem(result.contentItem),
    });

    return { ok: true };
  }
}

async function resolveLessonContentScope(
  repository: LessonContentRepository,
  path: LessonContentPath,
): Promise<LessonContentScope> {
  const scope = await repository.findLessonContentScope(path);
  if (!scope.curriculum || !scope.unit || !scope.lesson) {
    throw new LessonContentNotFoundException(path);
  }

  if (scope.unit.curriculumId !== path.curriculumId) {
    throw new LessonContentInvalidScopeException({
      ...path,
      field: 'unitId',
    });
  }

  if (
    scope.lesson.curriculumId !== path.curriculumId ||
    scope.lesson.unitId !== path.unitId
  ) {
    throw new LessonContentInvalidScopeException({
      ...path,
      field: 'lessonId',
    });
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
  repository: LessonContentRepository,
  path: LessonContentItemPath,
): Promise<LessonContentItemRecord> {
  const contentItem = await repository.findLessonContentItemById(path);
  if (!contentItem) {
    throw new LessonContentNotFoundException(path);
  }

  return contentItem;
}

async function ensureFileAvailable(
  repository: LessonContentRepository,
  payload: NormalizedLessonContentPayload,
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

  const file = await repository.findFileById(payload.fileId);
  if (!file) {
    throw new LessonContentFileNotFoundException({ fileId: payload.fileId });
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
  authRepository: AuthRepository,
  input: LessonContentAuditInput,
): Promise<unknown> {
  return authRepository.createAuditLog({
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'academics',
    action: input.action,
    resourceType: 'lesson_content_item',
    resourceId: input.resourceId,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: input.after,
  });
}

function summarizeLessonContentItem(
  item: LessonContentItemRecord,
): Record<string, unknown> {
  return {
    id: item.id,
    curriculumId: item.curriculumId,
    unitId: item.unitId,
    lessonId: item.lessonId,
    type: item.type,
    title: item.title,
    fileId: item.fileId,
    sortOrder: item.sortOrder,
    isRequired: item.isRequired,
    estimatedMinutes: item.estimatedMinutes,
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}
