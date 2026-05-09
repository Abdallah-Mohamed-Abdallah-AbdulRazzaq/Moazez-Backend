import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentTaskSubmissionResponseDto } from '../dto/parent-tasks.dto';
import { ParentTasksReadAdapter } from '../infrastructure/parent-tasks-read.adapter';
import { ParentTasksPresenter } from '../presenters/parent-tasks.presenter';

@Injectable()
export class GetParentChildTaskSubmissionUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentTasksReadAdapter,
  ) {}

  async execute(params: {
    studentId: string;
    taskId: string;
    submissionId: string;
  }): Promise<ParentTaskSubmissionResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(
      params.studentId,
    );
    const submission = await this.readAdapter.findTaskSubmission({
      child,
      taskId: params.taskId,
      submissionId: params.submissionId,
    });

    if (!submission) {
      throw new NotFoundDomainException(
        'Parent App task submission not found',
        {
          studentId: params.studentId,
          taskId: params.taskId,
          submissionId: params.submissionId,
        },
      );
    }

    return ParentTasksPresenter.presentSubmission(submission);
  }
}
