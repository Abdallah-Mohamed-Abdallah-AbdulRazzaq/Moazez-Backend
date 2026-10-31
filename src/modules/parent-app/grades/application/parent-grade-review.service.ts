import { Injectable } from '@nestjs/common';
import { GradeReviewService } from '../../../grades/assessments/application/grade-review.service';
import type { GradeReviewAudienceResource } from '../../../grades/assessments/infrastructure/grade-review-audience.authorization';
import type { GradeAnswerMediaResource } from '../../../grades/assessments/infrastructure/grade-answer-media.repository';
import type { PrivateMediaContentRequest } from '../../../../infrastructure/storage/private-media-content.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
@Injectable()
export class ParentGradeReviewService {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly reviews: GradeReviewService,
  ) {}
  private async resource(
    studentId: string,
    assessmentId: string,
    examOnly = false,
  ): Promise<GradeReviewAudienceResource> {
    await this.access.assertParentOwnsStudent(studentId);
    return { assessmentId, studentId: studentId, examOnly };
  }
  async read(studentId: string, assessmentId: string, examOnly = false) {
    return this.reviews.read(
      'PARENT',
      await this.resource(studentId, assessmentId, examOnly),
    );
  }
  async answerAssets(
    studentId: string,
    input: GradeAnswerMediaResource,
    examOnly = false,
  ) {
    return this.reviews.answerAssets('PARENT', {
      ...(await this.resource(studentId, input.assessmentId, examOnly)),
      ...input,
    });
  }
  async openAnswer(
    studentId: string,
    input: GradeAnswerMediaResource & { assetId: string },
    request: PrivateMediaContentRequest,
    examOnly = false,
  ) {
    return this.reviews.openAnswer(
      'PARENT',
      {
        ...(await this.resource(studentId, input.assessmentId, examOnly)),
        ...input,
      },
      request,
    );
  }
  async paperAssets(
    studentId: string,
    input: { assessmentId: string; questionId?: string },
    examOnly = false,
  ) {
    return this.reviews.paperAssets('PARENT', {
      ...(await this.resource(studentId, input.assessmentId, examOnly)),
      ...input,
    });
  }
  async openPaper(
    studentId: string,
    input: { assessmentId: string; questionId?: string; assetId: string },
    request: PrivateMediaContentRequest,
    examOnly = false,
  ) {
    return this.reviews.openPaper(
      'PARENT',
      {
        ...(await this.resource(studentId, input.assessmentId, examOnly)),
        ...input,
      },
      request,
    );
  }
  async openGroup(
    studentId: string,
    input: { assessmentId: string; groupId: string; assetId: string },
    request: PrivateMediaContentRequest,
    examOnly = false,
  ) {
    return this.reviews.openGroup(
      'PARENT',
      {
        ...(await this.resource(studentId, input.assessmentId, examOnly)),
        ...input,
      },
      request,
    );
  }
}
