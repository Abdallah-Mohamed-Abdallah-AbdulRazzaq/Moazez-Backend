import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentBehaviorListResponseDto,
  StudentBehaviorQueryDto,
} from '../dto/student-behavior.dto';
import { StudentBehaviorReadAdapter } from '../infrastructure/student-behavior-read.adapter';
import { StudentBehaviorPresenter } from '../presenters/student-behavior.presenter';

@Injectable()
export class ListStudentBehaviorRecordsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentBehaviorReadAdapter,
  ) {}

  async execute(
    query?: StudentBehaviorQueryDto,
  ): Promise<StudentBehaviorListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listVisibleBehaviorRecords({
      context,
      query,
    });

    return StudentBehaviorPresenter.presentList(result);
  }
}
