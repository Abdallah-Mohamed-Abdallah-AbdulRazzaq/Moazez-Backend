import { Injectable } from '@nestjs/common';
import { ReviewGradeSubmissionAnswerUseCase } from '../../../../grades/assessments/application/review-grade-submission-answer.use-case';
import { ReviewGradeSubmissionAnswerDto } from '../../../../grades/assessments/dto/grade-submission-review.dto';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomSubmissionAnswerReviewResponseDto } from '../dto/teacher-classroom-submission-review.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomSubmissionReviewPresenter } from '../presenters/teacher-classroom-submission-review.presenter';

@Injectable()
export class ReviewTeacherClassroomSubmissionAnswerUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
    private readonly reviewAnswerUseCase: ReviewGradeSubmissionAnswerUseCase,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assignmentId: string,
    submissionId: string,
    answerId: string,
    dto: ReviewGradeSubmissionAnswerDto,
  ): Promise<TeacherClassroomSubmissionAnswerReviewResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);

    await this.gradesReadAdapter.assertOwnedAssignmentSubmissionReviewTarget({
      allocation,
      assignmentId,
      submissionId,
    });
    await this.gradesReadAdapter.assertOwnedSubmissionAnswer({
      allocation,
      assignmentId,
      submissionId,
      answerId,
    });

    const answer = await this.reviewAnswerUseCase.execute(
      submissionId,
      answerId,
      dto,
    );

    return TeacherClassroomSubmissionReviewPresenter.presentReviewedAnswer({
      classId: allocation.id,
      assignmentId,
      submissionId,
      answer,
    });
  }
}
