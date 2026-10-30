import { Injectable } from '@nestjs/common';
import type { PrivateMediaContentRequest } from '../../../../infrastructure/storage/private-media-content.service';
import type {
  BindAnswerUploadDto,
  CreateAnswerUploadDto,
} from '../../../files/assessment-media/dto/answer-media.dto';
import { GradeAnswerMediaRepository } from '../infrastructure/grade-answer-media.repository';
import { GradeAnswerMediaService } from './grade-answer-media.service';

type Resource = { submissionId: string; questionId: string; assetId?: string };

/** Core Grades resolves the parent from its existing Submission locator. Shared persistence still owns every authorization. */
@Injectable()
export class CoreGradeAnswerMediaService {
  constructor(
    private readonly repository: GradeAnswerMediaRepository,
    private readonly media: GradeAnswerMediaService,
  ) {}
  async create(
    input: Resource,
    command: CreateAnswerUploadDto,
    trustedOrigin?: string,
  ) {
    return this.media.create(
      await this.repository.locate(input.submissionId, input.questionId),
      command,
      trustedOrigin,
    );
  }
  async upload(
    input: Resource,
    uploadId: string,
    operation: 'status' | 'complete' | 'cancel',
  ) {
    return this.media.upload(
      await this.repository.locate(input.submissionId, input.questionId),
      uploadId,
      operation,
    );
  }
  async bind(input: Resource, command: BindAnswerUploadDto) {
    return this.media.bind(
      await this.repository.locate(input.submissionId, input.questionId),
      command,
    );
  }
  async remove(input: Resource & { assetId: string }) {
    return this.media.remove({
      ...(await this.repository.locate(input.submissionId, input.questionId)),
      assetId: input.assetId,
    });
  }
  async list(input: Resource) {
    return this.media.list(
      await this.repository.locate(input.submissionId, input.questionId),
    );
  }
  async open(
    input: Resource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.media.open(
      {
        ...(await this.repository.locate(input.submissionId, input.questionId)),
        assetId: input.assetId,
      },
      request,
    );
  }
}
