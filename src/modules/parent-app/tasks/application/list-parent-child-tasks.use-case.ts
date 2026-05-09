import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentTasksListResponseDto,
  ParentTasksQueryDto,
} from '../dto/parent-tasks.dto';
import { ParentTasksReadAdapter } from '../infrastructure/parent-tasks-read.adapter';
import { ParentTasksPresenter } from '../presenters/parent-tasks.presenter';

@Injectable()
export class ListParentChildTasksUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentTasksReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentTasksQueryDto,
  ): Promise<ParentTasksListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const [result, summary] = await Promise.all([
      this.readAdapter.listTasks({ child, query }),
      this.readAdapter.getSummary(child),
    ]);

    return ParentTasksPresenter.presentList({ result, summary });
  }
}
