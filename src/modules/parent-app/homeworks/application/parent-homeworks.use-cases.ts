import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentHomeworkResponseDto,
  ParentHomeworksListResponseDto,
  ParentHomeworksQueryDto,
} from '../dto/parent-homeworks.dto';
import { ParentHomeworksReadAdapter } from '../infrastructure/parent-homeworks-read.adapter';
import { ParentHomeworksPresenter } from '../presenters/parent-homeworks.presenter';

@Injectable()
export class ListParentChildHomeworksUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHomeworksReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentHomeworksQueryDto,
  ): Promise<ParentHomeworksListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const homeworks = await this.readAdapter.listHomeworks({ child, query });

    return ParentHomeworksPresenter.presentList(homeworks);
  }
}

@Injectable()
export class GetParentChildHomeworkUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHomeworksReadAdapter,
  ) {}

  async execute(
    studentId: string,
    homeworkId: string,
  ): Promise<ParentHomeworkResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const homework = await this.readAdapter.findHomework({
      child,
      homeworkId,
    });

    if (!homework) {
      throw new NotFoundDomainException('Parent App homework not found', {
        studentId,
        homeworkId,
      });
    }

    return ParentHomeworksPresenter.presentDetail(homework);
  }
}
