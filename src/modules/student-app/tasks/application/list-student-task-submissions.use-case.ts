import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentTaskSubmissionsResponseDto } from '../dto/student-tasks.dto';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

@Injectable()
export class ListStudentTaskSubmissionsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentTasksReadAdapter,
  ) {}

  async execute(taskId: string): Promise<StudentTaskSubmissionsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const submissions = await this.readAdapter.listTaskSubmissions({
      context,
      taskId,
    });

    if (!submissions) {
      throw new NotFoundDomainException('Student App task not found', {
        taskId,
      });
    }

    return StudentTasksPresenter.presentSubmissions({ taskId, submissions });
  }
}
