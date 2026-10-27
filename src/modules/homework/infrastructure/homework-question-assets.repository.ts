import {
  getCurrentRequestId,
  getRequestContext,
} from '../../../common/context/request-context';
import type { RichAssetResolver } from '../../../common/rich-content/rich-content.types';
import { Injectable } from '@nestjs/common';
import { PersistedUrlPolicy } from '../../../infrastructure/storage/provider-url.policy';
import {
  AuditOutcome,
  Prisma,
  type File as ManagedFile,
  type HomeworkQuestionAsset,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { AssessmentMediaRuntimePolicy } from '../../files/assessment-media/application/assessment-media-runtime.policy';
import {
  assessmentMediaOwner,
  AssessmentMediaException,
} from '../../files/assessment-media/domain/assessment-media.contract';
import { assertAssessmentReadyContentPolicy } from '../../files/assessment-media/domain/assessment-media-ready';
import {
  assertAssessmentUploadPolicy,
  effectiveAssessmentMediaPolicy,
  type EffectiveAssessmentMediaPolicy,
} from '../../files/assessment-media/domain/assessment-media.policy';
import { AssessmentMediaRepository } from '../../files/assessment-media/infrastructure/assessment-media.repository';
import { resolveFileContentType } from '../../files/shared/domain/file-content.registry';
import {
  assetCategoryForMime,
  homeworkAssetExternalUrl,
  type HomeworkAssetActor,
  type HomeworkAssetResource,
} from '../domain/homework-question-asset';
import type {
  CreateHomeworkQuestionAssetDto,
  UpdateHomeworkQuestionAssetDto,
} from '../dto/homework-question-asset.dto';
import { requireHomeworkScope, type HomeworkScope } from '../homework-context';
import { authorizeHomeworkQuestionAssets } from './homework-question-asset-authorization';

export interface HomeworkQuestionAssetView {
  asset: HomeworkQuestionAsset;
  file: ManagedFile | null;
  externalUrl: string | null;
  previewAllowed: boolean;
  downloadAllowed: boolean;
  usable: boolean;
}
export type CreateQuestionAssetData = Pick<
  CreateHomeworkQuestionAssetDto,
  | 'sourceType'
  | 'uploadId'
  | 'fileId'
  | 'externalUrl'
  | 'category'
  | 'sortOrder'
> & { title: string | null; description: string | null };
export type UpdateQuestionAssetData = UpdateHomeworkQuestionAssetDto;
const absent = () => new NotFoundDomainException();
const orderBy = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

@Injectable()
export class HomeworkQuestionAssetsRepository implements RichAssetResolver<
  Prisma.TransactionClient,
  HomeworkScope & { resourceActor: HomeworkAssetActor }
> {
  private readonly privateBucket: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: TeacherAllocationOperationalWriteGate,
    private readonly media: AssessmentMediaRepository,
    private readonly runtime: AssessmentMediaRuntimePolicy,
    storage: StorageService,
    private readonly urls: PersistedUrlPolicy,
  ) {
    this.privateBucket = storage.resolveBucket('PRIVATE');
  }
  private get scoped(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }
  private transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.scoped.$transaction(operation, {
      maxWait: 5000,
      timeout: 15000,
    });
  }
  private async policy(
    tx: Prisma.TransactionClient,
    schoolId: string,
    lock: boolean,
  ): Promise<EffectiveAssessmentMediaPolicy> {
    if (lock)
      await tx.$queryRaw`SELECT id FROM school_assessment_media_policies WHERE school_id = ${schoolId}::uuid FOR SHARE`;
    return effectiveAssessmentMediaPolicy(
      await tx.schoolAssessmentMediaPolicy.findFirst({ where: { schoolId } }),
    );
  }
  private async view(
    tx: Prisma.TransactionClient,
    asset: HomeworkQuestionAsset,
    homeworkId: string,
    policy: EffectiveAssessmentMediaPolicy,
    lock = false,
  ): Promise<HomeworkQuestionAssetView> {
    let file: ManagedFile | null = null;
    let externalUrl: string | null = null;
    if (asset.sourceType === 'MANAGED_FILE' && asset.fileId) {
      try {
        const ready = await this.media.readyHomeworkFile(tx, {
          fileId: asset.fileId,
          contextId: homeworkId,
          creatorId: asset.createdByUserId,
          privateBucket: this.privateBucket,
          lock,
        });
        assertAssessmentReadyContentPolicy(policy, ready.session, ready.file);
        if (
          resolveFileContentType(ready.file.originalName, ready.file.mimeType)
        )
          file = ready.file;
      } catch (error) {
        if (!(error instanceof AssessmentMediaException)) throw error;
      }
    } else if (asset.sourceType === 'EXTERNAL_HTTPS') {
      try {
        externalUrl = homeworkAssetExternalUrl(asset.externalUrl, (value) =>
          this.urls.classify(value),
        );
      } catch (error) {
        if (!(error instanceof ValidationDomainException)) throw error;
      }
    }
    return {
      asset,
      file,
      externalUrl,
      usable: !!file || !!externalUrl,
      previewAllowed: !!file && policy.allowInlinePreview,
      downloadAllowed: !!file && policy.allowDownload,
    };
  }
  /** A reference is an existing question binding, never a File capability. */
  async assertReference(
    input: Parameters<
      RichAssetResolver<
        Prisma.TransactionClient,
        HomeworkScope & { resourceActor: HomeworkAssetActor }
      >['assertReference']
    >[0],
  ): Promise<void> {
    const { transaction: tx, owner, actor, reference, audience } = input;
    const scope = requireHomeworkScope();
    if (
      owner.domain !== 'homework' ||
      input.schoolId !== scope.schoolId ||
      actor.actorId !== scope.actorId ||
      actor.userType !== scope.userType ||
      actor.schoolId !== scope.schoolId ||
      actor.organizationId !== scope.organizationId ||
      actor.roleId !== scope.roleId ||
      !actor.resourceActor ||
      !getRequestContext()?.activeMembership
    )
      throw absent();
    await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      actor.resourceActor,
      { homeworkId: owner.homeworkId, questionId: owner.questionId },
      audience === 'author',
    );
    if (owner.optionId) {
      if (audience === 'author')
        await tx.$queryRaw`SELECT id FROM homework_question_options WHERE id = ${owner.optionId}::uuid
          AND homework_question_id = ${owner.questionId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
      const option = await tx.homeworkQuestionOption.findFirst({
        where: {
          id: owner.optionId,
          homeworkQuestionId: owner.questionId,
          deletedAt: null,
          homeworkQuestion: {
            is: { homeworkAssignmentId: owner.homeworkId, deletedAt: null },
          },
        },
        select: { id: true },
      });
      if (!option) throw absent();
    }
    if (audience === 'author')
      await tx.$queryRaw`SELECT id FROM homework_question_assets WHERE id = ${reference.assetId}::uuid
        AND homework_question_id = ${owner.questionId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
    const asset = await tx.homeworkQuestionAsset.findFirst({
      where: {
        id: reference.assetId,
        homeworkQuestionId: owner.questionId,
        deletedAt: null,
      },
    });
    if (
      !asset ||
      asset.sourceType !== 'MANAGED_FILE' ||
      !asset.fileId ||
      asset.category.toLowerCase() !== reference.kind
    )
      throw absent();
    const policy = await this.policy(tx, scope.schoolId, audience === 'author');
    const view = await this.view(
      tx,
      asset,
      owner.homeworkId,
      policy,
      audience === 'author',
    );
    const content =
      view.file &&
      resolveFileContentType(view.file.originalName, view.file.mimeType);
    if (
      !content ||
      !view.file ||
      assetCategoryForMime(content.category) !== asset.category ||
      !(
        view.downloadAllowed ||
        (view.previewAllowed && content.inlinePreviewSupported)
      )
    )
      throw absent();
  }
  async read(
    actor: HomeworkAssetActor,
    input: { homeworkId: string; questionId?: string; assetId?: string },
  ): Promise<HomeworkQuestionAssetView[]> {
    return this.transaction(async (tx) => {
      const { scope } = await authorizeHomeworkQuestionAssets(
        tx,
        this.gate,
        actor,
        input,
      );
      const policy = await this.policy(tx, scope.schoolId, false);
      const assets = await tx.homeworkQuestionAsset.findMany({
        where: {
          ...(input.assetId ? { id: input.assetId } : {}),
          ...(input.questionId ? { homeworkQuestionId: input.questionId } : {}),
          deletedAt: null,
          homeworkQuestion: {
            is: { homeworkAssignmentId: input.homeworkId, deletedAt: null },
          },
        },
        orderBy: [...orderBy],
      });
      const views: HomeworkQuestionAssetView[] = [];
      for (const asset of assets) {
        const view = await this.view(tx, asset, input.homeworkId, policy);
        if (actor.surface !== 'student' || view.usable) views.push(view);
      }
      return views;
    });
  }
  async create(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource,
    data: CreateQuestionAssetData,
  ): Promise<HomeworkQuestionAssetView> {
    try {
      return await this.transaction(async (tx) => {
        const { scope } = await authorizeHomeworkQuestionAssets(
          tx,
          this.gate,
          actor,
          input,
          true,
          data.sourceType === 'MANAGED_FILE',
        );
        const policy = await this.policy(tx, scope.schoolId, true);
        let category = data.category ?? 'OTHER';
        if (data.sourceType === 'MANAGED_FILE') {
          this.runtime.assertUploadExecutionEnabled();
          const owner = assessmentMediaOwner(
            'HOMEWORK_ASSIGNMENT_MEDIA',
            input.homeworkId,
          );
          const ready = await this.media.readyHomeworkFile(tx, {
            fileId: data.fileId!,
            uploadId: data.uploadId!,
            contextId: input.homeworkId,
            creatorId: scope.actorId,
            privateBucket: this.privateBucket,
            lock: true,
          });
          assertAssessmentReadyContentPolicy(policy, ready.session, ready.file);
          assertAssessmentUploadPolicy(
            policy,
            owner,
            ready.file.mimeType,
            ready.file.sizeBytes,
          );
          await this.media.assertHomeworkBindingCapacity(tx, owner, policy);
          const content = resolveFileContentType(
            ready.file.originalName,
            ready.file.mimeType,
          );
          if (!content) throw absent();
          category = assetCategoryForMime(content.category);
          if (data.category !== undefined && data.category !== category)
            throw new ValidationDomainException(
              'Asset category must match verified content',
            );
        }
        const asset = await tx.homeworkQuestionAsset.create({
          data: {
            schoolId: scope.schoolId,
            homeworkQuestionId: input.questionId,
            createdByUserId: scope.actorId,
            sourceType: data.sourceType,
            category,
            fileId: data.sourceType === 'MANAGED_FILE' ? data.fileId! : null,
            externalUrl:
              data.sourceType === 'EXTERNAL_HTTPS'
                ? homeworkAssetExternalUrl(data.externalUrl, (value) =>
                    this.urls.classify(value),
                  )
                : null,
            title: data.title,
            description: data.description,
            sortOrder: data.sortOrder ?? 0,
          },
        });
        await this.audit(tx, scope, input, asset, 'create');
        return this.view(tx, asset, input.homeworkId, policy);
      });
    } catch (error) {
      throw this.controlled(error);
    }
  }
  async change(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource & { assetId: string },
    operation:
      | { kind: 'metadata'; data: UpdateQuestionAssetData }
      | { kind: 'reorder'; sortOrder: number }
      | { kind: 'delete' },
  ): Promise<HomeworkQuestionAssetView> {
    try {
      return await this.transaction(async (tx) => {
        const { scope } = await authorizeHomeworkQuestionAssets(
          tx,
          this.gate,
          actor,
          input,
          true,
        );
        const locked = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM homework_question_assets
          WHERE id = ${input.assetId}::uuid AND homework_question_id = ${input.questionId}::uuid
            AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (!locked.length) throw absent();
        const existing = await tx.homeworkQuestionAsset.findFirst({
          where: {
            id: input.assetId,
            homeworkQuestionId: input.questionId,
            deletedAt: null,
          },
        });
        if (!existing) throw absent();
        const policy = await this.policy(tx, scope.schoolId, true);
        if (
          operation.kind === 'metadata' &&
          operation.data.category !== undefined &&
          existing.sourceType === 'MANAGED_FILE'
        ) {
          const current = await this.view(
            tx,
            existing,
            input.homeworkId,
            policy,
          );
          const content =
            current.file &&
            resolveFileContentType(
              current.file.originalName,
              current.file.mimeType,
            );
          if (!content) throw absent();
          if (
            operation.data.category !== assetCategoryForMime(content.category)
          )
            throw new ValidationDomainException(
              'Asset category must match verified content',
            );
        }
        const data =
          operation.kind === 'metadata'
            ? operation.data
            : operation.kind === 'reorder'
              ? { sortOrder: operation.sortOrder }
              : { deletedAt: new Date() };
        const changed = await tx.homeworkQuestionAsset.updateMany({
          where: {
            id: existing.id,
            homeworkQuestionId: input.questionId,
            deletedAt: null,
          },
          data,
        });
        if (changed.count !== 1) throw absent();
        // Explicit opt-in is unnecessary: the locked historical identity is already
        // known, and returning the deleted row is internal only (DELETE returns 204).
        const asset =
          operation.kind === 'delete'
            ? { ...existing, deletedAt: new Date() }
            : await tx.homeworkQuestionAsset.findFirst({
                where: { id: existing.id, deletedAt: null },
              });
        if (!asset) throw absent();
        await this.audit(tx, scope, input, asset, operation.kind);
        return this.view(tx, asset, input.homeworkId, policy);
      });
    } catch (error) {
      throw this.controlled(error);
    }
  }
  private controlled(error: unknown): unknown {
    if (
      error instanceof AssessmentMediaException &&
      error.reason === 'ready_relationship_invalid'
    )
      return absent();
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003' || error.code === 'P2025') return absent();
      if (error.code === 'P2004')
        return new ValidationDomainException('Asset source is invalid');
    }
    return error;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    scope: HomeworkScope,
    input: HomeworkAssetResource,
    asset: HomeworkQuestionAsset,
    action: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: scope.actorId,
        userType: scope.userType,
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        module: 'homework',
        action: `homework.question.asset.${action}`,
        resourceType: 'HomeworkQuestionAsset',
        resourceId: asset.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          requestId: getCurrentRequestId(),
          homeworkId: input.homeworkId,
          questionId: input.questionId,
          assetId: asset.id,
          sourceType: asset.sourceType,
          category: asset.category,
          sortOrder: asset.sortOrder,
          deleted: !!asset.deletedAt,
        },
      },
    });
  }
}
