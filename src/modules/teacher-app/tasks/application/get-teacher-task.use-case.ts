import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherTaskDetailResponseDto } from '../dto/teacher-tasks.dto';
import { TeacherTasksReadAdapter } from '../infrastructure/teacher-tasks-read.adapter';
import { TeacherTasksPresenter } from '../presenters/teacher-tasks.presenter';

@Injectable()
export class GetTeacherTaskUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly tasksReadAdapter: TeacherTasksReadAdapter,
  ) {}

  async execute(taskId: string): Promise<TeacherTaskDetailResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.allocationReadAdapter.listAllOwnedAllocations(
      context.teacherUserId,
    );
    const task = await this.tasksReadAdapter.findVisibleTaskById({
      teacherUserId: context.teacherUserId,
      allocations,
      taskId,
    });

    if (!task) {
      throw new NotFoundDomainException('Teacher task not found', { taskId });
    }

    return TeacherTasksPresenter.presentDetail({ task, allocations });
  }
}
