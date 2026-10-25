import { Injectable } from '@nestjs/common';
import { PersistedUrlPolicy } from '../../../../infrastructure/storage/provider-url.policy';
import { AssessmentAssetCategory } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
  type PrivateMediaFileDescriptor,
} from '../../../../infrastructure/storage/private-media-content.service';
import { assertAssessmentUuid } from '../../../files/assessment-media/domain/assessment-media.contract';
import {
  type GradeAssetActor,
  type GradeAssetResource,
} from '../domain/grade-asset';
import {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
  ReorderGradeAssetDto,
  type GradeAssetDto,
  type GradeAssetResponseDto,
  type GradeAssetsResponseDto,
} from '../dto/grade-asset.dto';
import {
  GradeAssetsRepository,
  type CreateGradeAssetData,
  type UpdateGradeAssetData,
} from '../infrastructure/grade-assets.repository';
import { presentGradeAsset } from '../presenters/grade-asset.presenter';

import {
  assetDisplayText,
  assessmentAssetExternalUrl,
} from '../../../files/assessment-media/domain/assessment-asset-content';

const absent = () => new NotFoundDomainException();
const own = (value: object, key: string) =>
  Object.hasOwn(value, key) &&
  (value as Record<string, unknown>)[key] !== undefined;
function category(value: unknown): AssessmentAssetCategory {
  if (!(Object.values(AssessmentAssetCategory) as unknown[]).includes(value))
    throw new ValidationDomainException('Asset category is invalid');
  return value as AssessmentAssetCategory;
}
function order(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 2147483647
  )
    throw new ValidationDomainException('Asset order is invalid');
  return value;
}

@Injectable()
export class GradeAssetsService {
  constructor(
    private readonly repository: GradeAssetsRepository,
    private readonly content: PrivateMediaContentService,
    private readonly urls: PersistedUrlPolicy,
  ) {}
  async list(
    actor: GradeAssetActor,
    input: GradeAssetResource,
  ): Promise<GradeAssetsResponseDto> {
    const views = await this.repository.read(actor, input);
    return {
      assessmentId: input.assessmentId,
      ...(input.questionId ? { questionId: input.questionId } : {}),
      assets: views.map((view) =>
        presentGradeAsset(view, actor, input.assessmentId),
      ),
    };
  }
  async get(
    actor: GradeAssetActor,
    input: GradeAssetResource & { assetId: string },
  ): Promise<GradeAssetResponseDto> {
    const [view] = await this.repository.read(actor, input);
    if (!view) throw absent();
    return {
      asset: presentGradeAsset(view, actor, input.assessmentId),
    };
  }
  async studentAssets(
    actor: GradeAssetActor,
    assessmentId: string,
  ): Promise<{
    assessment: GradeAssetDto[];
    questions: ReadonlyMap<string, GradeAssetDto[]>;
  }> {
    const assessment: GradeAssetDto[] = [];
    const questions = new Map<string, GradeAssetDto[]>();
    for (const view of await this.repository.read(
      actor,
      { assessmentId },
      true,
    )) {
      const asset = presentGradeAsset(view, actor, assessmentId);
      if ('questionId' in view.asset) {
        const group = questions.get(view.asset.questionId) ?? [];
        group.push(asset);
        questions.set(view.asset.questionId, group);
      } else assessment.push(asset);
    }
    return { assessment, questions };
  }
  async create(
    actor: GradeAssetActor,
    input: GradeAssetResource,
    command: CreateGradeAssetDto,
  ): Promise<GradeAssetResponseDto> {
    const data: CreateGradeAssetData = {
      sourceType: command.sourceType,
      title: assetDisplayText(command.title, 255),
      description: assetDisplayText(command.description, 2000),
      ...(own(command, 'category')
        ? { category: category(command.category) }
        : {}),
      ...(own(command, 'sortOrder')
        ? { sortOrder: order(command.sortOrder) }
        : {}),
    };
    if (command.sourceType === 'MANAGED_FILE') {
      if (
        command.externalUrl != null ||
        typeof command.fileId !== 'string' ||
        typeof command.uploadId !== 'string'
      )
        throw new ValidationDomainException('Managed asset source is invalid');
      assertAssessmentUuid(command.fileId);
      assertAssessmentUuid(command.uploadId);
      data.fileId = command.fileId;
      data.uploadId = command.uploadId;
    } else if (command.sourceType === 'EXTERNAL_HTTPS') {
      if (command.fileId != null || command.uploadId != null)
        throw new ValidationDomainException('External asset source is invalid');
      data.externalUrl = assessmentAssetExternalUrl(
        command.externalUrl,
        (value) => this.urls.classify(value),
      );
    } else throw new ValidationDomainException('Asset source is invalid');
    const view = await this.repository.create(actor, input, data);
    return {
      asset: presentGradeAsset(view, actor, input.assessmentId),
    };
  }
  async update(
    actor: GradeAssetActor,
    input: GradeAssetResource & { assetId: string },
    command: UpdateGradeAssetDto,
  ): Promise<GradeAssetResponseDto> {
    const data: UpdateGradeAssetData = {};
    if (own(command, 'title'))
      data.title = assetDisplayText(command.title, 255);
    if (own(command, 'description'))
      data.description = assetDisplayText(command.description, 2000);
    if (own(command, 'category')) data.category = category(command.category);
    if (!Object.keys(data).length)
      throw new ValidationDomainException('Asset metadata is empty');
    const view = await this.repository.change(actor, input, {
      kind: 'metadata',
      data,
    });
    return {
      asset: presentGradeAsset(view, actor, input.assessmentId),
    };
  }
  async reorder(
    actor: GradeAssetActor,
    input: GradeAssetResource & { assetId: string },
    command: ReorderGradeAssetDto,
  ): Promise<GradeAssetResponseDto> {
    const view = await this.repository.change(actor, input, {
      kind: 'reorder',
      sortOrder: order(command.sortOrder),
    });
    return {
      asset: presentGradeAsset(view, actor, input.assessmentId),
    };
  }
  async remove(
    actor: GradeAssetActor,
    input: GradeAssetResource & { assetId: string },
  ): Promise<void> {
    await this.repository.change(actor, input, { kind: 'delete' });
  }
  openContent(
    actor: GradeAssetActor | (() => Promise<GradeAssetActor>),
    input: GradeAssetResource & { assetId: string },
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async (): Promise<PrivateMediaFileDescriptor> => {
        const resolved = typeof actor === 'function' ? await actor() : actor;
        const [view] = await this.repository.read(resolved, input);
        if (
          !view?.file ||
          (request.disposition === 'inline'
            ? !view.previewAllowed
            : !view.downloadAllowed)
        )
          throw absent();
        const file = view.file;
        return {
          bucket: file.bucket,
          objectKey: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      },
      absent,
      request,
    );
  }
}
