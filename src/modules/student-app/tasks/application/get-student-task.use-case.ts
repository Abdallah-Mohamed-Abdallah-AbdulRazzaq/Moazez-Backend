import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentTaskResponseDto } from '../dto/student-tasks.dto';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

@Injectable()
export class GetStudentTaskUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentTasksReadAdapter,
  ) {}

  async execute(taskId: string): Promise<StudentTaskResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const task = await this.readAdapter.findTask({ context, taskId });

    if (!task) {
      throw new NotFoundDomainException('Student App task not found', {
        taskId,
      });
    }

    return StudentTasksPresenter.presentTask(task);
  }
}
