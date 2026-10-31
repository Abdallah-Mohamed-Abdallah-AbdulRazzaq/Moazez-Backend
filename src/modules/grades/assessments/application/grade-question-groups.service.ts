import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import type { GradeAssetActor } from '../domain/grade-asset';
import { GradeQuestionGroupsRepository } from '../infrastructure/grade-question-groups.repository';
import type {
  CreateQuestionGroupDto,
  UpdateQuestionGroupDto,
  ChangeQuestionGroupLayoutDto,
  UpdateQuestionGroupAssetDto,
} from '../../../../common/question-groups/question-group.dto';
import type { CreateQuestionGroupAssetDto } from '../../../files/assessment-media/dto/question-group-asset.dto';
type Resource = { assessmentId: string; groupId?: string; assetId?: string };
@Injectable()
export class GradeQuestionGroupsService {
  constructor(
    private readonly repository: GradeQuestionGroupsRepository,
    private readonly content: PrivateMediaContentService,
  ) {}
  list(actor: GradeAssetActor, input: Resource) {
    return this.repository.read(actor, input);
  }
  create(
    actor: GradeAssetActor,
    input: Resource,
    command: CreateQuestionGroupDto,
  ) {
    return this.repository.create(actor, input, command);
  }
  update(
    actor: GradeAssetActor,
    input: Resource & { groupId: string },
    command: UpdateQuestionGroupDto,
  ) {
    return this.repository.update(actor, input, command);
  }
  remove(actor: GradeAssetActor, input: Resource & { groupId: string }) {
    return this.repository.remove(actor, input);
  }
  layout(
    actor: GradeAssetActor,
    input: Resource,
    command: ChangeQuestionGroupLayoutDto,
  ) {
    return this.repository.layout(actor, input, command);
  }
  createAsset(
    actor: GradeAssetActor,
    input: Resource & { groupId: string },
    command: CreateQuestionGroupAssetDto,
  ) {
    return this.repository.createAsset(actor, input, command);
  }
  updateAsset(
    actor: GradeAssetActor,
    input: Resource & { groupId: string; assetId: string },
    command: UpdateQuestionGroupAssetDto,
  ) {
    return this.repository.changeAsset(actor, input, command);
  }
  removeAsset(
    actor: GradeAssetActor,
    input: Resource & { groupId: string; assetId: string },
  ) {
    return this.repository.changeAsset(actor, input, null);
  }
  open(
    actor: GradeAssetActor | (() => Promise<GradeAssetActor>),
    input: Resource & { groupId: string; assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.content.openAuthorized(
      async () => {
        const view = await this.repository.asset(
          typeof actor === 'function' ? await actor() : actor,
          input,
        );
        if (
          !view.file ||
          (request.disposition === 'inline'
            ? !view.previewAllowed
            : !view.downloadAllowed)
        )
          throw new NotFoundDomainException();
        const file = view.file;
        return {
          bucket: file.bucket,
          objectKey: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      },
      () => new NotFoundDomainException(),
      request,
    );
  }
}
