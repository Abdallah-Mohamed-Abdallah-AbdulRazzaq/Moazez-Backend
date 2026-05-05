import { Injectable } from '@nestjs/common';
import { BulkReviewGradeSubmissionAnswersUseCase } from '../../../../grades/assessments/application/bulk-review-grade-submission-answers.use-case';
import { BulkReviewGradeSubmissionAnswersDto } from '../../../../grades/assessments/dto/grade-submission-review.dto';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomBulkSubmissionAnswerReviewResponseDto } from '../dto/teacher-classroom-submission-review.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomSubmissionReviewPresenter } from '../presenters/teacher-classroom-submission-review.presenter';

@Injectable()
export class BulkReviewTeacherClassroomSubmissionAnswersUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
    private readonly bulkReviewAnswersUseCase: BulkReviewGradeSubmissionAnswersUseCase,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assignmentId: string,
    submissionId: string,
    dto: BulkReviewGradeSubmissionAnswersDto,
  ): Promise<TeacherClassroomBulkSubmissionAnswerReviewResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);

    await this.gradesReadAdapter.assertOwnedAssignmentSubmissionReviewTarget({
      allocation,
      assignmentId,
      submissionId,
    });
    await this.gradesReadAdapter.assertOwnedSubmissionAnswers({
      allocation,
      assignmentId,
      submissionId,
      answerIds: dto.reviews.map((review) => review.answerId),
    });

    const result = await this.bulkReviewAnswersUseCase.execute(
      submissionId,
      dto,
    );

    return TeacherClassroomSubmissionReviewPresenter.presentBulkReviewedAnswers(
      {
        classId: allocation.id,
        assignmentId,
        submissionId,
        result,
      },
    );
  }
}
