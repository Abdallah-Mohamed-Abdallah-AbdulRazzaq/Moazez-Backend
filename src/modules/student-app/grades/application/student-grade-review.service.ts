import { Injectable } from '@nestjs/common';
import { GradeReviewService } from '../../../grades/assessments/application/grade-review.service';
import type { GradeReviewAudienceResource } from '../../../grades/assessments/infrastructure/grade-review-audience.authorization';
import type { GradeAnswerMediaResource } from '../../../grades/assessments/infrastructure/grade-answer-media.repository';
import type { PrivateMediaContentRequest } from '../../../../infrastructure/storage/private-media-content.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
@Injectable()
export class StudentGradeReviewService {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly reviews: GradeReviewService,
  ) {}
  private async resource(
    assessmentId: string,
    examOnly = false,
  ): Promise<GradeReviewAudienceResource> {
    const { context } = await this.access.getCurrentStudentWithEnrollment();
    return { assessmentId, studentId: context.studentId, examOnly };
  }
  async read(assessmentId: string, examOnly = false) {
    return this.reviews.read(
      'STUDENT',
      await this.resource(assessmentId, examOnly),
    );
  }
  async answerAssets(input: GradeAnswerMediaResource, examOnly = false) {
    return this.reviews.answerAssets('STUDENT', {
      ...(await this.resource(input.assessmentId, examOnly)),
      ...input,
    });
  }
  async openAnswer(
    input: GradeAnswerMediaResource & { assetId: string },
    request: PrivateMediaContentRequest,
    examOnly = false,
  ) {
    return this.reviews.openAnswer(
      'STUDENT',
      { ...(await this.resource(input.assessmentId, examOnly)), ...input },
      request,
    );
  }
  async paperAssets(
    input: { assessmentId: string; questionId?: string },
    examOnly = false,
  ) {
    return this.reviews.paperAssets('STUDENT', {
      ...(await this.resource(input.assessmentId, examOnly)),
      ...input,
    });
  }
  async openPaper(
    input: { assessmentId: string; questionId?: string; assetId: string },
    request: PrivateMediaContentRequest,
    examOnly = false,
  ) {
    return this.reviews.openPaper(
      'STUDENT',
      { ...(await this.resource(input.assessmentId, examOnly)), ...input },
      request,
    );
  }
  async openGroup(
    input: { assessmentId: string; groupId: string; assetId: string },
    request: PrivateMediaContentRequest,
    examOnly = false,
  ) {
    return this.reviews.openGroup(
      'STUDENT',
      { ...(await this.resource(input.assessmentId, examOnly)), ...input },
      request,
    );
  }
}
