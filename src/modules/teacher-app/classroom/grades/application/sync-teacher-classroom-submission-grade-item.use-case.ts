import { Injectable } from '@nestjs/common';
import { SyncGradeSubmissionToGradeItemUseCase } from '../../../../grades/assessments/application/sync-grade-submission-to-grade-item.use-case';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomSubmissionGradeItemSyncResponseDto } from '../dto/teacher-classroom-submission-review.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomSubmissionReviewPresenter } from '../presenters/teacher-classroom-submission-review.presenter';

@Injectable()
export class SyncTeacherClassroomSubmissionGradeItemUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
    private readonly syncGradeItemUseCase: SyncGradeSubmissionToGradeItemUseCase,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assignmentId: string,
    submissionId: string,
  ): Promise<TeacherClassroomSubmissionGradeItemSyncResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);

    await this.gradesReadAdapter.assertOwnedAssignmentSubmissionReviewTarget({
      allocation,
      assignmentId,
      submissionId,
    });

    const result = await this.syncGradeItemUseCase.execute(submissionId);

    return TeacherClassroomSubmissionReviewPresenter.presentGradeItemSync({
      classId: allocation.id,
      assignmentId,
      submissionId,
      result,
    });
  }
}
