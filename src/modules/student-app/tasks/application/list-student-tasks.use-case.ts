import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentTasksListResponseDto,
  StudentTasksQueryDto,
} from '../dto/student-tasks.dto';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

@Injectable()
export class ListStudentTasksUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentTasksReadAdapter,
  ) {}

  async execute(
    query?: StudentTasksQueryDto,
  ): Promise<StudentTasksListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const [tasks, summary] = await Promise.all([
      this.readAdapter.listTasks({ context, query }),
      this.readAdapter.getSummary(context),
    ]);

    return StudentTasksPresenter.presentList(tasks, summary);
  }
}
