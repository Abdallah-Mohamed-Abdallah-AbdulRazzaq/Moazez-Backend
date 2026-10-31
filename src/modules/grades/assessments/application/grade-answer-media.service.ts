import { Injectable } from '@nestjs/common';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AssessmentMediaService } from '../../../files/assessment-media/application/assessment-media.service';
import {
  BindAnswerUploadDto,
  CreateAnswerUploadDto,
  presentAnswerAsset,
} from '../../../files/assessment-media/dto/answer-media.dto';
import {
  GradeAnswerMediaRepository,
  type GradeAnswerMediaResource,
} from '../infrastructure/grade-answer-media.repository';

@Injectable()
export class GradeAnswerMediaService {
  constructor(
    private readonly repository: GradeAnswerMediaRepository,
    private readonly uploads: AssessmentMediaService,
    private readonly content: PrivateMediaContentService,
  ) {}
  async create(
    input: GradeAnswerMediaResource,
    command: CreateAnswerUploadDto,
    trustedOrigin?: string,
  ) {
    await this.repository.studentResource(input);
    return this.uploads.createGradeQuestionAnswerUpload(
      input.submissionId,
      input.questionId,
      { ...command, trustedOrigin },
    );
  }
  async upload(
    input: GradeAnswerMediaResource,
    uploadId: string,
    operation: 'status' | 'complete' | 'cancel',
  ) {
    await this.repository.studentResource(input);
    return this.uploads[operation](
      'GRADE_SUBMISSION_MEDIA',
      input.submissionId,
      uploadId,
      input.questionId,
    );
  }
  async bind(input: GradeAnswerMediaResource, command: BindAnswerUploadDto) {
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
  remove(input: GradeAnswerMediaResource & { assetId: string }) {
    return this.repository.remove(input);
  }
  async list(
    input: GradeAnswerMediaResource,
    released?: Parameters<GradeAnswerMediaRepository['read']>[1],
  ) {
    return {
      assets: (await this.repository.read(input, released)).map((v) => ({
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
    input: GradeAnswerMediaResource & { assetId: string },
    request: PrivateMediaContentRequest,
    released?: Parameters<GradeAnswerMediaRepository['read']>[1],
  ) {
    return this.content.openAuthorized(
      async () => {
        const [view] = await this.repository.read(input, released);
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
