import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentXpProgressResponseDto } from '../dto/student-progress.dto';
import { StudentProgressReadAdapter } from '../infrastructure/student-progress-read.adapter';
import { StudentProgressPresenter } from '../presenters/student-progress.presenter';

@Injectable()
export class GetStudentXpProgressUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentProgressReadAdapter,
  ) {}

  async execute(): Promise<StudentXpProgressResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.getXpProgress(context);

    return StudentProgressPresenter.presentXp(result);
  }
}
