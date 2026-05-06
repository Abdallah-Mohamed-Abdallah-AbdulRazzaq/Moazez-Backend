import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentBehaviorQueryDto,
  StudentBehaviorSummaryResponseDto,
} from '../dto/student-behavior.dto';
import { StudentBehaviorReadAdapter } from '../infrastructure/student-behavior-read.adapter';
import { StudentBehaviorPresenter } from '../presenters/student-behavior.presenter';

@Injectable()
export class GetStudentBehaviorSummaryUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentBehaviorReadAdapter,
  ) {}

  async execute(
    query?: StudentBehaviorQueryDto,
  ): Promise<StudentBehaviorSummaryResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const summary = await this.readAdapter.getBehaviorSummary({
      context,
      query,
    });

    return StudentBehaviorPresenter.presentSummary(summary);
  }
}
