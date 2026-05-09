import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentTaskSubmissionsResponseDto } from '../dto/parent-tasks.dto';
import { ParentTasksReadAdapter } from '../infrastructure/parent-tasks-read.adapter';
import { ParentTasksPresenter } from '../presenters/parent-tasks.presenter';

@Injectable()
export class ListParentChildTaskSubmissionsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentTasksReadAdapter,
  ) {}

  async execute(
    studentId: string,
    taskId: string,
  ): Promise<ParentTaskSubmissionsResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const submissions = await this.readAdapter.listTaskSubmissions({
      child,
      taskId,
    });

    if (!submissions) {
      throw new NotFoundDomainException('Parent App task not found', {
        studentId,
        taskId,
      });
    }

    return ParentTasksPresenter.presentSubmissions({
      child,
      taskId,
      submissions,
    });
  }
}
