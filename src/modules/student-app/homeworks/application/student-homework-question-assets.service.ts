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
  ) {}
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
