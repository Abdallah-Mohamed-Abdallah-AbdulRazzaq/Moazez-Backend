import { Injectable } from '@nestjs/common';
import { FinalizeGradeSubmissionReviewUseCase } from '../../../../grades/assessments/application/finalize-grade-submission-review.use-case';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomSubmissionReviewFinalizeResponseDto } from '../dto/teacher-classroom-submission-review.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomSubmissionReviewPresenter } from '../presenters/teacher-classroom-submission-review.presenter';

@Injectable()
export class FinalizeTeacherClassroomSubmissionReviewUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
    private readonly finalizeReviewUseCase: FinalizeGradeSubmissionReviewUseCase,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assignmentId: string,
    submissionId: string,
  ): Promise<TeacherClassroomSubmissionReviewFinalizeResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);

    await this.gradesReadAdapter.assertOwnedAssignmentSubmissionReviewTarget({
      allocation,
      assignmentId,
      submissionId,
    });

    const submission = await this.finalizeReviewUseCase.execute(submissionId);

    return TeacherClassroomSubmissionReviewPresenter.presentFinalizedSubmission(
      {
        classId: allocation.id,
        assignmentId,
        submission,
      },
    );
  }
}
