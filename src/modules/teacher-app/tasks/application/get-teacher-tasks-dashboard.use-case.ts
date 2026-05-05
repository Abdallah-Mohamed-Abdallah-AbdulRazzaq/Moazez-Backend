import { Injectable } from '@nestjs/common';
import { ReinforcementSource } from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherTaskDashboardResponseDto } from '../dto/teacher-tasks.dto';
import { TeacherTasksReadAdapter } from '../infrastructure/teacher-tasks-read.adapter';
import { TeacherTasksPresenter } from '../presenters/teacher-tasks.presenter';

@Injectable()
export class GetTeacherTasksDashboardUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly tasksReadAdapter: TeacherTasksReadAdapter,
  ) {}

  async execute(): Promise<TeacherTaskDashboardResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.allocationReadAdapter.listAllOwnedAllocations(
      context.teacherUserId,
    );
    const [ownedStudents, tasks] = await Promise.all([
      this.tasksReadAdapter.listOwnedStudents(allocations),
      this.tasksReadAdapter.listAllVisibleTasks({
        teacherUserId: context.teacherUserId,
        allocations,
        filters: { source: ReinforcementSource.TEACHER },
      }),
    ]);

    return TeacherTasksPresenter.presentDashboard({
      tasks,
      allocations,
      ownedStudents,
    });
  }
}
