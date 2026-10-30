import { Optional } from '@nestjs/common';
import { HomeworkQuestionGroupsService } from '../../../homework/application/homework-question-groups.service';
import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { PrivateMediaContentRequest } from '../../../../infrastructure/storage/private-media-content.service';
import { HomeworkQuestionAssetsService } from '../../../homework/application/homework-question-assets.service';
import type { HomeworkAssetResource } from '../../../homework/domain/homework-question-asset';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHomeworksReadAdapter } from '../infrastructure/student-homeworks-read.adapter';

@Injectable()
export class StudentHomeworkQuestionAssetsService {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly read: StudentHomeworksReadAdapter,
    private readonly assets: HomeworkQuestionAssetsService,
    @Optional() private readonly groups?: HomeworkQuestionGroupsService,
  ) {}
  private async groupActor(homeworkId: string) {
    const { context } = await this.access.getCurrentStudentWithEnrollment();
    if (!(await this.read.findVisibleHomeworkBoundary({ context, homeworkId })))
      throw new NotFoundDomainException();
    return { surface: 'student' as const, student: context };
  }
  async groupMetadata(homeworkId: string) {
    if (!this.groups) throw new NotFoundDomainException();
    return this.groups.list(await this.groupActor(homeworkId), { homeworkId });
  }
  groupContent(
    input: { homeworkId: string; groupId: string; assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    if (!this.groups) throw new NotFoundDomainException();
    return this.groups.open(
      () => this.groupActor(input.homeworkId),
      input,
      request,
    );
  }
  openContent(
    input: HomeworkAssetResource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.assets.openContent(
      async () => {
        const { context } = await this.access.getCurrentStudentWithEnrollment();
        if (
          !(await this.read.findVisibleHomeworkBoundary({
            context,
            homeworkId: input.homeworkId,
          }))
        )
          throw new NotFoundDomainException();
        return { surface: 'student' as const, student: context };
      },
      input,
      request,
    );
  }
}
