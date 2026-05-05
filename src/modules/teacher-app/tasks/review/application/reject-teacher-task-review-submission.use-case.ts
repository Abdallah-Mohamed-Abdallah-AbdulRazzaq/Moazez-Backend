import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { RejectReinforcementSubmissionUseCase } from '../../../../reinforcement/reviews/application/reject-reinforcement-submission.use-case';
import { TeacherAppAllocationReadAdapter } from '../../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import {
  RejectTeacherTaskReviewSubmissionDto,
  TeacherTaskReviewSubmissionResponseDto,
} from '../dto/teacher-task-review-queue.dto';
import { TeacherTaskReviewReadAdapter } from '../infrastructure/teacher-task-review-read.adapter';
import { TeacherTaskReviewPresenter } from '../presenters/teacher-task-review.presenter';

@Injectable()
export class RejectTeacherTaskReviewSubmissionUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly reviewReadAdapter: TeacherTaskReviewReadAdapter,
    private readonly rejectReinforcementSubmissionUseCase: RejectReinforcementSubmissionUseCase,
  ) {}

  async execute(
    submissionId: string,
    dto: RejectTeacherTaskReviewSubmissionDto,
  ): Promise<TeacherTaskReviewSubmissionResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations =
      await this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      );
    await this.assertVisibleSubmission({
      teacherUserId: context.teacherUserId,
      allocations,
      submissionId,
    });

    await this.rejectReinforcementSubmissionUseCase.execute(submissionId, {
      note:
        normalizeText(dto.note) ??
        normalizeText(dto.reason) ??
        normalizeText(dto.comment),
      noteAr: normalizeText(dto.noteAr),
    });

    const updated = await this.assertVisibleSubmission({
      teacherUserId: context.teacherUserId,
      allocations,
      submissionId,
    });

    return TeacherTaskReviewPresenter.presentDetail({
      submission: updated,
      allocations,
    });
  }

  private async assertVisibleSubmission(params: {
    teacherUserId: string;
    allocations: Parameters<
      TeacherTaskReviewReadAdapter['findVisibleSubmissionById']
    >[0]['allocations'];
    submissionId: string;
  }) {
    const submission =
      await this.reviewReadAdapter.findVisibleSubmissionById(params);

    if (!submission) {
      throw new NotFoundDomainException(
        'Teacher task review submission not found',
        { submissionId: params.submissionId },
      );
    }

    return submission;
  }
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
