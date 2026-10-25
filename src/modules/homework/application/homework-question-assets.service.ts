import { Injectable } from '@nestjs/common';
import { PersistedUrlPolicy } from '../../../infrastructure/storage/provider-url.policy';
import { AssessmentAssetCategory } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
  type PrivateMediaFileDescriptor,
} from '../../../infrastructure/storage/private-media-content.service';
import { assertAssessmentUuid } from '../../files/assessment-media/domain/assessment-media.contract';
import {
  assetDisplayText,
  homeworkAssetExternalUrl,
  type HomeworkAssetActor,
  type HomeworkAssetResource,
} from '../domain/homework-question-asset';
import {
  CreateHomeworkQuestionAssetDto,
  UpdateHomeworkQuestionAssetDto,
  ReorderHomeworkQuestionAssetDto,
  type HomeworkQuestionAssetDto,
  type HomeworkQuestionAssetResponseDto,
  type HomeworkQuestionAssetsResponseDto,
} from '../dto/homework-question-asset.dto';
import {
  HomeworkQuestionAssetsRepository,
  type CreateQuestionAssetData,
  type UpdateQuestionAssetData,
} from '../infrastructure/homework-question-assets.repository';
import { presentHomeworkQuestionAsset } from '../presenters/homework-question-asset.presenter';

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
export class HomeworkQuestionAssetsService {
  constructor(
    private readonly repository: HomeworkQuestionAssetsRepository,
    private readonly content: PrivateMediaContentService,
    private readonly urls: PersistedUrlPolicy,
  ) {}
  async list(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource,
  ): Promise<HomeworkQuestionAssetsResponseDto> {
    const views = await this.repository.read(actor, input);
    return {
      questionId: input.questionId,
      assets: views.map((view) =>
        presentHomeworkQuestionAsset(view, actor, input.homeworkId),
      ),
    };
  }
  async get(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource & { assetId: string },
  ): Promise<HomeworkQuestionAssetResponseDto> {
    const [view] = await this.repository.read(actor, input);
    if (!view) throw absent();
    return {
      asset: presentHomeworkQuestionAsset(view, actor, input.homeworkId),
    };
  }
  async studentAssets(
    actor: Extract<HomeworkAssetActor, { surface: 'student' }>,
    homeworkId: string,
  ): Promise<ReadonlyMap<string, HomeworkQuestionAssetDto[]>> {
    const grouped = new Map<string, HomeworkQuestionAssetDto[]>();
    for (const view of await this.repository.read(actor, { homeworkId })) {
      const assets = grouped.get(view.asset.homeworkQuestionId) ?? [];
      assets.push(presentHomeworkQuestionAsset(view, actor, homeworkId));
      grouped.set(view.asset.homeworkQuestionId, assets);
    }
    return grouped;
  }
  async create(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource,
    command: CreateHomeworkQuestionAssetDto,
  ): Promise<HomeworkQuestionAssetResponseDto> {
    const data: CreateQuestionAssetData = {
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
      data.externalUrl = homeworkAssetExternalUrl(
        command.externalUrl,
        (value) => this.urls.classify(value),
      );
    } else throw new ValidationDomainException('Asset source is invalid');
    const view = await this.repository.create(actor, input, data);
    return {
      asset: presentHomeworkQuestionAsset(view, actor, input.homeworkId),
    };
  }
  async update(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource & { assetId: string },
    command: UpdateHomeworkQuestionAssetDto,
  ): Promise<HomeworkQuestionAssetResponseDto> {
    const data: UpdateQuestionAssetData = {};
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
      asset: presentHomeworkQuestionAsset(view, actor, input.homeworkId),
    };
  }
  async reorder(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource & { assetId: string },
    command: ReorderHomeworkQuestionAssetDto,
  ): Promise<HomeworkQuestionAssetResponseDto> {
    const view = await this.repository.change(actor, input, {
      kind: 'reorder',
      sortOrder: order(command.sortOrder),
    });
    return {
      asset: presentHomeworkQuestionAsset(view, actor, input.homeworkId),
    };
  }
  async remove(
    actor: HomeworkAssetActor,
    input: HomeworkAssetResource & { assetId: string },
  ): Promise<void> {
    await this.repository.change(actor, input, { kind: 'delete' });
  }
  openContent(
    actor: HomeworkAssetActor | (() => Promise<HomeworkAssetActor>),
    input: HomeworkAssetResource & { assetId: string },
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
