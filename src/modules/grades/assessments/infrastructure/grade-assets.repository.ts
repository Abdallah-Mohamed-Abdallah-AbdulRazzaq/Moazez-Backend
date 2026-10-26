import type { RichAssetResolver } from '../../../../common/rich-content/rich-content.types';
import { getRequestContext } from '../../../../common/context/request-context';
import { ownedAllocationWhere } from '../../../academics/teacher-allocation/domain/owned-allocation';
import { requireGradesScope } from '../../grades-context';
import { assertGradeLiveMutationPermission } from './grades-resource-access';
import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  Prisma,
  type File as ManagedFile,
  type GradeAssessmentAsset,
  type GradeAssessmentQuestionAsset,
} from '@prisma/client';
import { getCurrentRequestId } from '../../../../common/context/request-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { PersistedUrlPolicy } from '../../../../infrastructure/storage/provider-url.policy';
import { TeacherAllocationOperationalWriteGate } from '../../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { AssessmentMediaRuntimePolicy } from '../../../files/assessment-media/application/assessment-media-runtime.policy';
import {
  assessmentMediaOwner,
  AssessmentMediaException,
} from '../../../files/assessment-media/domain/assessment-media.contract';
import { assertAssessmentReadyContentPolicy } from '../../../files/assessment-media/domain/assessment-media-ready';
import {
  assertAssessmentUploadPolicy,
  effectiveAssessmentMediaPolicy,
  type EffectiveAssessmentMediaPolicy,
} from '../../../files/assessment-media/domain/assessment-media.policy';
import { AssessmentMediaRepository } from '../../../files/assessment-media/infrastructure/assessment-media.repository';
import {
  assetCategoryForMime,
  assessmentAssetExternalUrl,
} from '../../../files/assessment-media/domain/assessment-asset-content';
import { resolveFileContentType } from '../../../files/shared/domain/file-content.registry';
import type { GradesScope } from '../../grades-context';
import {
  isGradeAssetStudent,
  type GradeAssetActor,
  type GradeAssetResource,
} from '../domain/grade-asset';
import type {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
} from '../dto/grade-asset.dto';
import { authorizeGradeAssets } from './grade-asset-authorization';

type Asset = GradeAssessmentAsset | GradeAssessmentQuestionAsset;
export interface GradeAssetView {
  asset: Asset;
  file: ManagedFile | null;
  externalUrl: string | null;
  previewAllowed: boolean;
  downloadAllowed: boolean;
  usable: boolean;
}
export type CreateGradeAssetData = Pick<
  CreateGradeAssetDto,
  | 'sourceType'
  | 'uploadId'
  | 'fileId'
  | 'externalUrl'
  | 'category'
  | 'sortOrder'
> & { title: string | null; description: string | null };
export type UpdateGradeAssetData = UpdateGradeAssetDto;
const absent = () => new NotFoundDomainException();
const orderBy = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

@Injectable()
export class GradeAssetsRepository implements RichAssetResolver<
  Prisma.TransactionClient,
  GradesScope
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
    // Immutable configuration lookup, before any authorization transaction.
    this.privateBucket = storage.resolveBucket('PRIVATE');
  }
  private transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const scoped = this.prisma.scoped as unknown as PrismaService;
    return scoped.$transaction(operation, { maxWait: 5000, timeout: 15000 });
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
    asset: Asset,
    assessmentId: string,
    policy: EffectiveAssessmentMediaPolicy,
    lock = false,
  ): Promise<GradeAssetView> {
    let file: ManagedFile | null = null;
    let externalUrl: string | null = null;
    if (asset.sourceType === 'MANAGED_FILE' && asset.fileId) {
      try {
        const ready = await this.media.readyGradeAssessmentFile(tx, {
          fileId: asset.fileId,
          contextId: assessmentId,
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
        externalUrl = assessmentAssetExternalUrl(asset.externalUrl, (value) =>
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
  /** Rich authoring uses the existing ST07 exact Teacher boundary and lock order. */
  async assertRichWrite(
    tx: Prisma.TransactionClient,
    assessmentId: string,
  ): Promise<void> {
    const scope = requireGradesScope();
    let actor: GradeAssetActor = { surface: 'core' };
    if (scope.userType === 'TEACHER') {
      const assessment = await tx.gradeAssessment.findFirst({
        where: { id: assessmentId },
        select: { classroomId: true, subjectId: true, termId: true },
      });
      if (!assessment?.classroomId) throw absent();
      const allocation = await tx.teacherSubjectAllocation.findFirst({
        where: {
          AND: [
            ownedAllocationWhere(scope.actorId),
            {
              classroomId: assessment.classroomId ?? '',
              subjectId: assessment.subjectId,
              termId: assessment.termId,
            },
          ],
        },
        select: { id: true },
      });
      if (!allocation) throw absent();
      actor = { surface: 'teacher', classId: allocation.id };
    }
    await authorizeGradeAssets(
      tx,
      this.gate,
      actor,
      { assessmentId },
      true,
      false,
      true,
    );
  }

  /** No capability is issued. The caller holds the authorized resource transaction. */
  async assertReference(
    input: Parameters<
      RichAssetResolver<
        Prisma.TransactionClient,
        GradesScope
      >['assertReference']
    >[0],
  ): Promise<void> {
    const { transaction: tx, owner, actor, reference, audience } = input;
    const scope = requireGradesScope();
    if (
      owner.domain !== 'grades' ||
      input.schoolId !== scope.schoolId ||
      actor.actorId !== scope.actorId ||
      actor.userType !== scope.userType ||
      actor.roleId !== scope.roleId ||
      actor.schoolId !== scope.schoolId ||
      actor.organizationId !== scope.organizationId ||
      !getRequestContext()?.activeMembership ||
      getRequestContext()?.bypass.bypassSchoolScope ||
      getRequestContext()?.bypass.includeSoftDeleted
    )
      throw absent();
    const permissions =
      getRequestContext()?.activeMembership?.permissions ?? [];
    const permission =
      audience === 'author'
        ? 'grades.questions.manage'
        : audience === 'student'
          ? 'grades.assessments.view'
          : [
              'grades.questions.view',
              'grades.questions.manage',
              'grades.submissions.view',
              'grades.submissions.review',
              'grades.assessments.view',
            ].find((value) => permissions.includes(value));
    if (!permission) throw absent();
    await assertGradeLiveMutationPermission(tx, permission);
    const question = await tx.gradeAssessmentQuestion.findFirst({
      where: {
        id: owner.questionId,
        assessmentId: owner.assessmentId,
        schoolId: scope.schoolId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!question) throw absent();
    if (
      owner.optionId &&
      !(await tx.gradeAssessmentQuestionOption.findFirst({
        where: {
          id: owner.optionId,
          questionId: owner.questionId,
          assessmentId: owner.assessmentId,
          schoolId: scope.schoolId,
          deletedAt: null,
        },
        select: { id: true },
      }))
    )
      throw absent();
    if (audience === 'author')
      await tx.$queryRaw`SELECT id FROM grade_assessment_question_assets WHERE id = ${reference.assetId}::uuid AND question_id = ${owner.questionId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
    const asset = await tx.gradeAssessmentQuestionAsset.findFirst({
      where: {
        id: reference.assetId,
        questionId: owner.questionId,
        schoolId: scope.schoolId,
        deletedAt: null,
      },
    });
    if (!asset || asset.category.toLowerCase() !== reference.kind)
      throw absent();
    const policy = await this.policy(tx, scope.schoolId, audience === 'author');
    const view = await this.view(
      tx,
      asset,
      owner.assessmentId,
      policy,
      audience === 'author',
    );
    if (!view.usable) throw absent();
  }

  async read(
    actor: GradeAssetActor,
    input: GradeAssetResource,
    includeQuestions = false,
  ): Promise<GradeAssetView[]> {
    return this.transaction(async (tx) => {
      const { scope, assessment } = await authorizeGradeAssets(
        tx,
        this.gate,
        actor,
        input,
      );
      const policy = await this.policy(tx, scope.schoolId, false);
      const assets: Asset[] = input.questionId
        ? await tx.gradeAssessmentQuestionAsset.findMany({
            where: {
              ...(input.assetId ? { id: input.assetId } : {}),
              questionId: input.questionId,
              deletedAt: null,
              gradeAssessmentQuestion: {
                is: { assessmentId: input.assessmentId, deletedAt: null },
              },
            },
            orderBy: [...orderBy],
          })
        : await tx.gradeAssessmentAsset.findMany({
            where: {
              assessmentId: input.assessmentId,
              deletedAt: null,
              ...(input.assetId ? { id: input.assetId } : {}),
            },
            orderBy: [...orderBy],
          });
      if (
        includeQuestions &&
        !input.questionId &&
        assessment.deliveryMode === 'QUESTION_BASED'
      )
        assets.push(
          ...(await tx.gradeAssessmentQuestionAsset.findMany({
            where: {
              deletedAt: null,
              gradeAssessmentQuestion: {
                is: { assessmentId: input.assessmentId, deletedAt: null },
              },
            },
            orderBy: [...orderBy],
          })),
        );
      const views: GradeAssetView[] = [];
      for (const asset of assets) {
        const view = await this.view(tx, asset, input.assessmentId, policy);
        if (!isGradeAssetStudent(actor) || view.usable) views.push(view);
      }
      return views;
    });
  }
  async create(
    actor: GradeAssetActor,
    input: GradeAssetResource,
    data: CreateGradeAssetData,
  ): Promise<GradeAssetView> {
    try {
      return await this.transaction(async (tx) => {
        const { scope } = await authorizeGradeAssets(
          tx,
          this.gate,
          actor,
          input,
          true,
          data.sourceType === 'MANAGED_FILE',
        );
        const policy = await this.policy(tx, scope.schoolId, true);
        // The assessment lock serializes references across both families. Physical reservations remain producer-owned.
        const referenceCount =
          (await tx.gradeAssessmentAsset.count({
            where: { assessmentId: input.assessmentId, deletedAt: null },
          })) +
          (await tx.gradeAssessmentQuestionAsset.count({
            where: {
              deletedAt: null,
              gradeAssessmentQuestion: {
                is: { assessmentId: input.assessmentId, deletedAt: null },
              },
            },
          }));
        if (referenceCount >= policy.maximumFilesPerResource)
          throw new AssessmentMediaException('quota_exceeded');
        let category = data.category ?? 'OTHER';
        if (data.sourceType === 'MANAGED_FILE') {
          this.runtime.assertUploadExecutionEnabled();
          const owner = assessmentMediaOwner(
            'GRADE_ASSESSMENT_MEDIA',
            input.assessmentId,
          );
          const ready = await this.media.readyGradeAssessmentFile(tx, {
            fileId: data.fileId!,
            uploadId: data.uploadId!,
            contextId: input.assessmentId,
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
          await this.media.assertAuthoringBindingCapacity(tx, owner, policy);
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
        const common = {
          schoolId: scope.schoolId,
          createdByUserId: scope.actorId,
          sourceType: data.sourceType,
          category,
          fileId: data.sourceType === 'MANAGED_FILE' ? data.fileId! : null,
          externalUrl:
            data.sourceType === 'EXTERNAL_HTTPS'
              ? assessmentAssetExternalUrl(data.externalUrl, (value) =>
                  this.urls.classify(value),
                )
              : null,
          title: data.title,
          description: data.description,
          sortOrder: data.sortOrder ?? 0,
        };
        const asset: Asset = input.questionId
          ? await tx.gradeAssessmentQuestionAsset.create({
              data: { ...common, questionId: input.questionId },
            })
          : await tx.gradeAssessmentAsset.create({
              data: { ...common, assessmentId: input.assessmentId },
            });
        await this.audit(tx, scope, input, asset, 'create');
        return this.view(tx, asset, input.assessmentId, policy);
      });
    } catch (error) {
      throw this.controlled(error);
    }
  }
  async change(
    actor: GradeAssetActor,
    input: GradeAssetResource & { assetId: string },
    operation:
      | { kind: 'metadata'; data: UpdateGradeAssetData }
      | { kind: 'reorder'; sortOrder: number }
      | { kind: 'delete' },
  ): Promise<GradeAssetView> {
    try {
      return await this.transaction(async (tx) => {
        const { scope } = await authorizeGradeAssets(
          tx,
          this.gate,
          actor,
          input,
          true,
        );
        const locked = input.questionId
          ? await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM grade_assessment_question_assets
     WHERE id = ${input.assetId}::uuid AND question_id = ${input.questionId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`
          : await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM grade_assessment_assets WHERE id = ${input.assetId}::uuid
     AND assessment_id = ${input.assessmentId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (!locked.length) throw absent();
        const existing: Asset | null = input.questionId
          ? await tx.gradeAssessmentQuestionAsset.findFirst({
              where: {
                id: input.assetId,
                questionId: input.questionId,
                deletedAt: null,
              },
            })
          : await tx.gradeAssessmentAsset.findFirst({
              where: {
                id: input.assetId,
                assessmentId: input.assessmentId,
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
            input.assessmentId,
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
        const changed = input.questionId
          ? await tx.gradeAssessmentQuestionAsset.updateMany({
              where: {
                id: existing.id,
                questionId: input.questionId,
                deletedAt: null,
              },
              data,
            })
          : await tx.gradeAssessmentAsset.updateMany({
              where: {
                id: existing.id,
                assessmentId: input.assessmentId,
                deletedAt: null,
              },
              data,
            });
        if (changed.count !== 1) throw absent();
        const asset =
          operation.kind === 'delete'
            ? { ...existing, ...data }
            : input.questionId
              ? await tx.gradeAssessmentQuestionAsset.findFirst({
                  where: { id: existing.id, deletedAt: null },
                })
              : await tx.gradeAssessmentAsset.findFirst({
                  where: { id: existing.id, deletedAt: null },
                });
        if (!asset) throw absent();
        await this.audit(tx, scope, input, asset, operation.kind);
        return this.view(tx, asset, input.assessmentId, policy);
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
    scope: GradesScope,
    input: GradeAssetResource,
    asset: Asset,
    action: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: scope.actorId,
        userType: scope.userType,
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        module: 'grades',
        action: `grade.${input.questionId ? 'question' : 'assessment'}.asset.${action}`,
        resourceType: input.questionId
          ? 'GradeAssessmentQuestionAsset'
          : 'GradeAssessmentAsset',
        resourceId: asset.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          requestId: getCurrentRequestId(),
          assessmentId: input.assessmentId,
          ...(input.questionId ? { questionId: input.questionId } : {}),
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
