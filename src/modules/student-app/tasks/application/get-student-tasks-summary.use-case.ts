import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentTasksSummaryResponseDto } from '../dto/student-tasks.dto';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

@Injectable()
export class GetStudentTasksSummaryUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentTasksReadAdapter,
  ) {}

  async execute(): Promise<StudentTasksSummaryResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const summary = await this.readAdapter.getSummary(context);

    return StudentTasksPresenter.presentSummary(summary);
  }
}
