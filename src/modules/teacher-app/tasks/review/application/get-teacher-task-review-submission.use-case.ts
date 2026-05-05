import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { TeacherAppAllocationReadAdapter } from '../../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import { TeacherTaskReviewSubmissionResponseDto } from '../dto/teacher-task-review-queue.dto';
import { TeacherTaskReviewReadAdapter } from '../infrastructure/teacher-task-review-read.adapter';
import { TeacherTaskReviewPresenter } from '../presenters/teacher-task-review.presenter';

@Injectable()
export class GetTeacherTaskReviewSubmissionUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly reviewReadAdapter: TeacherTaskReviewReadAdapter,
  ) {}

  async execute(
    submissionId: string,
  ): Promise<TeacherTaskReviewSubmissionResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations =
      await this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      );
    const submission = await this.reviewReadAdapter.findVisibleSubmissionById({
      teacherUserId: context.teacherUserId,
      allocations,
      submissionId,
    });

    if (!submission) {
      throw new NotFoundDomainException(
        'Teacher task review submission not found',
        { submissionId },
      );
    }

    return TeacherTaskReviewPresenter.presentDetail({
      submission,
      allocations,
    });
  }
}
