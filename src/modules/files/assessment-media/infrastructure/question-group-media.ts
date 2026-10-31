import { Injectable } from '@nestjs/common';
import {
  FileVisibility,
  Prisma,
  type File as ManagedFile,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { PersistedUrlPolicy } from '../../../../infrastructure/storage/provider-url.policy';
import { AssessmentMediaRuntimePolicy } from '../application/assessment-media-runtime.policy';
import {
  assessmentMediaOwner,
  AssessmentMediaException,
} from '../domain/assessment-media.contract';
import { assertAssessmentReadyContentPolicy } from '../domain/assessment-media-ready';
import {
  assertAssessmentUploadPolicy,
  effectiveAssessmentMediaPolicy,
} from '../domain/assessment-media.policy';
import {
  assetCategoryForMime,
  assetDisplayText,
  assessmentAssetExternalUrl,
} from '../domain/assessment-asset-content';
import { resolveFileContentType } from '../../shared/domain/file-content.registry';
import { requireFilesScope } from '../../uploads/files-scope';
import { AssessmentMediaRepository } from './assessment-media.repository';
import type { CreateQuestionGroupAssetDto } from '../dto/question-group-asset.dto';

export type GroupMediaPurpose =
  | 'HOMEWORK_ASSIGNMENT_MEDIA'
  | 'GRADE_ASSESSMENT_MEDIA';
export interface GroupAssetRow {
  id: string;
  groupId: string;
  fileId: string | null;
  externalUrl: string | null;
  sourceType: 'MANAGED_FILE' | 'EXTERNAL_HTTPS';
  category: string;
  title: string | null;
  description: string | null;
  sortOrder: number;
  createdByUserId: string;
  createdAt: Date;
}
export interface GroupAssetView {
  asset: GroupAssetRow;
  file: ManagedFile | null;
  externalUrl: string | null;
  previewAllowed: boolean;
  downloadAllowed: boolean;
}
/** Verification/transport primitive. Each domain owns resource ACLs, locks and reference limits. */
@Injectable()
export class QuestionGroupMedia {
  private readonly privateBucket: string;
  constructor(
    private readonly media: AssessmentMediaRepository,
    private readonly runtime: AssessmentMediaRuntimePolicy,
    storage: StorageService,
    private readonly urls: PersistedUrlPolicy,
  ) {
    this.privateBucket = storage.resolveBucket(FileVisibility.PRIVATE);
  }
  async policy(tx: Prisma.TransactionClient, lock = false) {
    const scope = requireFilesScope();
    if (lock)
      await tx.$queryRaw`SELECT id FROM school_assessment_media_policies WHERE school_id=${scope.schoolId}::uuid FOR SHARE`;
    return effectiveAssessmentMediaPolicy(
      await tx.schoolAssessmentMediaPolicy.findFirst({
        where: { schoolId: scope.schoolId },
      }),
    );
  }
  private ready(
    tx: Prisma.TransactionClient,
    purpose: GroupMediaPurpose,
    parentId: string,
    fileId: string,
    creatorId: string,
    uploadId?: string,
    lock = false,
  ) {
    const input = {
      fileId,
      contextId: parentId,
      creatorId,
      uploadId,
      lock,
      privateBucket: this.privateBucket,
    };
    return purpose === 'HOMEWORK_ASSIGNMENT_MEDIA'
      ? this.media.readyHomeworkFile(tx, input)
      : this.media.readyGradeAssessmentFile(tx, input);
  }
  async createData(
    tx: Prisma.TransactionClient,
    purpose: GroupMediaPurpose,
    parentId: string,
    input: CreateQuestionGroupAssetDto,
  ) {
    const scope = requireFilesScope(),
      policy = await this.policy(tx, true);
    let category = input.category ?? 'OTHER';
    let fileId: string | null = null,
      externalUrl: string | null = null;
    if (input.sourceType === 'MANAGED_FILE') {
      if (!input.fileId || !input.uploadId || input.externalUrl != null)
        throw new ValidationDomainException(
          'Managed group asset source is invalid',
        );
      this.runtime.assertUploadExecutionEnabled();
      const owner = assessmentMediaOwner(purpose, parentId);
      const ready = await this.ready(
        tx,
        purpose,
        parentId,
        input.fileId,
        scope.actorId,
        input.uploadId,
        true,
      );
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
      if (!content) throw new NotFoundDomainException();
      category = assetCategoryForMime(content.category);
      if (input.category !== undefined && input.category !== category)
        throw new ValidationDomainException(
          'Asset category must match verified content',
        );
      fileId = ready.file.id;
    } else if (input.sourceType === 'EXTERNAL_HTTPS') {
      if (input.fileId != null || input.uploadId != null)
        throw new ValidationDomainException(
          'External group asset source is invalid',
        );
      externalUrl = assessmentAssetExternalUrl(input.externalUrl, (value) =>
        this.urls.classify(value),
      );
    } else throw new ValidationDomainException('Group asset source is invalid');
    return {
      schoolId: scope.schoolId,
      createdByUserId: scope.actorId,
      sourceType: input.sourceType,
      category,
      fileId,
      externalUrl,
      title: assetDisplayText(input.title, 255),
      description: assetDisplayText(input.description, 2000),
      sortOrder: input.sortOrder ?? 0,
    };
  }
  async view(
    tx: Prisma.TransactionClient,
    purpose: GroupMediaPurpose,
    parentId: string,
    asset: GroupAssetRow,
  ): Promise<GroupAssetView> {
    const policy = await this.policy(tx);
    let file: ManagedFile | null = null,
      externalUrl: string | null = null;
    try {
      if (asset.sourceType === 'MANAGED_FILE' && asset.fileId) {
        const ready = await this.ready(
          tx,
          purpose,
          parentId,
          asset.fileId,
          asset.createdByUserId,
          undefined,
          true,
        );
        assertAssessmentReadyContentPolicy(policy, ready.session, ready.file);
        if (
          resolveFileContentType(ready.file.originalName, ready.file.mimeType)
        )
          file = ready.file;
      } else if (asset.sourceType === 'EXTERNAL_HTTPS')
        externalUrl = assessmentAssetExternalUrl(asset.externalUrl, (value) =>
          this.urls.classify(value),
        );
    } catch (error) {
      if (
        !(error instanceof AssessmentMediaException) &&
        !(error instanceof ValidationDomainException)
      )
        throw error;
    }
    return {
      asset,
      file,
      externalUrl,
      previewAllowed: !!file && policy.allowInlinePreview,
      downloadAllowed: !!file && policy.allowDownload,
    };
  }
}
export function presentGroupAsset(view: GroupAssetView) {
  const { asset, file } = view;
  return {
    id: asset.id,
    groupId: asset.groupId,
    sourceType: asset.sourceType,
    category: asset.category,
    title: asset.title,
    description: asset.description,
    sortOrder: asset.sortOrder,
    externalUrl: view.externalUrl,
    available: !!file || !!view.externalUrl,
    previewAllowed: view.previewAllowed,
    downloadAllowed: view.downloadAllowed,
    ...(file
      ? {
          file: {
            filename: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes.toString(),
          },
        }
      : {}),
  };
}
