import { Injectable } from '@nestjs/common';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../infrastructure/storage/private-media-content.service';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { AssessmentMediaService } from '../../files/assessment-media/application/assessment-media.service';
import {
  BindAnswerUploadDto,
  CreateAnswerUploadDto,
  presentAnswerAsset,
} from '../../files/assessment-media/dto/answer-media.dto';
import {
  HomeworkAnswerMediaRepository,
  type HomeworkAnswerMediaResource,
} from '../infrastructure/homework-answer-media.repository';
import type { HomeworkAssetActor } from '../domain/homework-question-asset';

@Injectable()
export class HomeworkAnswerMediaService {
  constructor(
    private readonly repository: HomeworkAnswerMediaRepository,
    private readonly uploads: AssessmentMediaService,
    private readonly content: PrivateMediaContentService,
  ) {}
  async create(
    input: HomeworkAnswerMediaResource,
    command: CreateAnswerUploadDto,
    trustedOrigin?: string,
  ) {
    return this.uploads.createHomeworkQuestionAnswerUpload(
      await this.repository.target(input),
      input.questionId,
      { ...command, trustedOrigin },
    );
  }
  async upload(
    input: HomeworkAnswerMediaResource,
    uploadId: string,
    operation: 'status' | 'complete' | 'cancel',
  ) {
    const targetId = await this.repository.target(input);
    return this.uploads[operation](
      'HOMEWORK_SUBMISSION_MEDIA',
      targetId,
      uploadId,
      input.questionId,
    );
  }
  async bind(input: HomeworkAnswerMediaResource, command: BindAnswerUploadDto) {
    return {
      asset: presentAnswerAsset(
        await this.repository.bind(
          input,
          command.uploadId,
          command.replaceAssetId,
        ),
      ),
    };
  }
  remove(input: HomeworkAnswerMediaResource & { assetId: string }) {
    return this.repository.remove(input);
  }
  async list(
    actor: HomeworkAssetActor | undefined,
    input: HomeworkAnswerMediaResource,
  ) {
    const resolved = actor ?? (await this.repository.studentActor(input));
    return {
      assets: (await this.repository.read(resolved, input)).map((v) => ({
        ...presentAnswerAsset(v.asset),
        originalName: v.file.originalName,
        mimeType: v.file.mimeType,
        sizeBytes: v.file.sizeBytes.toString(),
        previewAllowed: v.previewAllowed,
        downloadAllowed: v.downloadAllowed,
      })),
    };
  }
  open(
    actor: HomeworkAssetActor | undefined,
    input: HomeworkAnswerMediaResource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.content.openAuthorized(
      async () => {
        const resolved = actor ?? (await this.repository.studentActor(input));
        const [view] = await this.repository.read(resolved, input);
        if (
          !view ||
          !(request.disposition === 'inline'
            ? view.previewAllowed
            : view.downloadAllowed)
        )
          throw new NotFoundDomainException();
        return view.file;
      },
      () => new NotFoundDomainException(),
      request,
    );
  }
}
