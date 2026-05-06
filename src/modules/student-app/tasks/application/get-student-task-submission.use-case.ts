import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentTaskSubmissionResponseDto } from '../dto/student-tasks.dto';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

@Injectable()
export class GetStudentTaskSubmissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentTasksReadAdapter,
  ) {}

  async execute(params: {
    taskId: string;
    submissionId: string;
  }): Promise<StudentTaskSubmissionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const submission = await this.readAdapter.findTaskSubmission({
      context,
      taskId: params.taskId,
      submissionId: params.submissionId,
    });

    if (!submission) {
      throw new NotFoundDomainException(
        'Student App task submission not found',
        {
          taskId: params.taskId,
          submissionId: params.submissionId,
        },
      );
    }

    return StudentTasksPresenter.presentSubmission(submission);
  }
}
