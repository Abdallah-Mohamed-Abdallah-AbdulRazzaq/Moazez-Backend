import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherTasksReadAdapter } from '../infrastructure/teacher-tasks-read.adapter';

@Injectable()
export class GetTeacherOwnedTaskProofContentUseCase {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly allocations: TeacherAppAllocationReadAdapter,
    private readonly reads: TeacherTasksReadAdapter,
    private readonly content: PrivateMediaContentService,
  ) {}

  execute(
    taskId: string,
    submissionId: string,
    fileId: string,
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const context = this.access.assertCurrentTeacher();
        const allocations = await this.allocations.listAllOwnedAllocations(
          context.teacherUserId,
        );
        const file = await this.reads.findAuthorizedProof({
          teacherUserId: context.teacherUserId,
          schoolId: context.schoolId,
          allocations,
          taskId,
          submissionId,
          fileId,
        });
        if (!file) throw new NotFoundDomainException('Task proof not found');
        return file;
      },
      () => new NotFoundDomainException('Task proof not found'),
      { ...request, disposition: 'attachment' },
    );
  }
}
