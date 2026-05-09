import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentTaskResponseDto } from '../dto/parent-tasks.dto';
import { ParentTasksReadAdapter } from '../infrastructure/parent-tasks-read.adapter';
import { ParentTasksPresenter } from '../presenters/parent-tasks.presenter';

@Injectable()
export class GetParentChildTaskUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentTasksReadAdapter,
  ) {}

  async execute(
    studentId: string,
    taskId: string,
  ): Promise<ParentTaskResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const task = await this.readAdapter.findTask({ child, taskId });

    if (!task) {
      throw new NotFoundDomainException('Parent App task not found', {
        studentId,
        taskId,
      });
    }

    return ParentTasksPresenter.presentTask(task);
  }
}
