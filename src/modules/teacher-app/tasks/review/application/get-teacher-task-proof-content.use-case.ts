import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../../infrastructure/storage/private-media-content.service';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import { TeacherTaskReviewReadAdapter } from '../infrastructure/teacher-task-review-read.adapter';
@Injectable()
export class GetTeacherTaskProofContentUseCase {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly reads: TeacherTaskReviewReadAdapter,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(
    submissionId: string,
    fileId: string,
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const context = this.access.assertCurrentTeacher();
        const allocations = await this.access.listOwnedTeacherAllocations();
        const file = await this.reads.findAuthorizedProof({
          teacherUserId: context.teacherUserId,
          schoolId: context.schoolId,
          allocations,
          submissionId,
          fileId,
        });
        if (!file) throw new NotFoundDomainException('Task proof not found');
        return file;
      },
      () => new NotFoundDomainException('Task proof not found'),
      request,
    );
  }
}
