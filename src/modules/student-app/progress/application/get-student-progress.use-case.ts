import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentProgressOverviewResponseDto } from '../dto/student-progress.dto';
import { StudentProgressReadAdapter } from '../infrastructure/student-progress-read.adapter';
import { StudentProgressPresenter } from '../presenters/student-progress.presenter';

@Injectable()
export class GetStudentProgressUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentProgressReadAdapter,
  ) {}

  async execute(): Promise<StudentProgressOverviewResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.getProgressOverview(context);

    return StudentProgressPresenter.presentOverview(result);
  }
}
