import { Injectable } from '@nestjs/common';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherTaskSelectorsResponseDto } from '../dto/teacher-tasks.dto';
import { TeacherTasksReadAdapter } from '../infrastructure/teacher-tasks-read.adapter';
import { TeacherTasksPresenter } from '../presenters/teacher-tasks.presenter';

@Injectable()
export class GetTeacherTaskSelectorsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly tasksReadAdapter: TeacherTasksReadAdapter,
  ) {}

  async execute(): Promise<TeacherTaskSelectorsResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.allocationReadAdapter.listAllOwnedAllocations(
      context.teacherUserId,
    );
    const ownedStudents = await this.tasksReadAdapter.listOwnedStudents(
      allocations,
    );

    return TeacherTasksPresenter.presentSelectors({
      allocations,
      ownedStudents,
    });
  }
}
