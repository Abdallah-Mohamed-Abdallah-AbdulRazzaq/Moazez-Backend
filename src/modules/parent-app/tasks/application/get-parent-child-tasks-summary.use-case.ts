import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentTasksSummaryResponseDto } from '../dto/parent-tasks.dto';
import { ParentTasksReadAdapter } from '../infrastructure/parent-tasks-read.adapter';
import { ParentTasksPresenter } from '../presenters/parent-tasks.presenter';

@Injectable()
export class GetParentChildTasksSummaryUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentTasksReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentTasksSummaryResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const summary = await this.readAdapter.getSummary(child);

    return ParentTasksPresenter.presentSummary(summary);
  }
}
