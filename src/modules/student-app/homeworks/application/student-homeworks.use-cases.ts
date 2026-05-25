import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentHomeworkResponseDto,
  StudentHomeworksListResponseDto,
  StudentHomeworksQueryDto,
} from '../dto/student-homeworks.dto';
import { StudentHomeworksReadAdapter } from '../infrastructure/student-homeworks-read.adapter';
import { StudentHomeworksPresenter } from '../presenters/student-homeworks.presenter';

@Injectable()
export class ListStudentHomeworksUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHomeworksReadAdapter,
  ) {}

  async execute(
    query?: StudentHomeworksQueryDto,
  ): Promise<StudentHomeworksListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const homeworks = await this.readAdapter.listHomeworks({ context, query });

    return StudentHomeworksPresenter.presentList(homeworks);
  }
}

@Injectable()
export class GetStudentHomeworkUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHomeworksReadAdapter,
  ) {}

  async execute(homeworkId: string): Promise<StudentHomeworkResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const homework = await this.readAdapter.findHomework({
      context,
      homeworkId,
    });

    if (!homework) {
      throw new NotFoundDomainException('Student App homework not found', {
        homeworkId,
      });
    }

    return StudentHomeworksPresenter.presentDetail(homework);
  }
}
