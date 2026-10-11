import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
@Injectable()
export class GetStudentAvatarContentUseCase {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly reads: StudentProfileReadAdapter,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(fileId: string, request: PrivateMediaContentRequest = {}) {
    return this.content.openAuthorized(
      async () => {
        const { context } = await this.access.getCurrentStudentWithEnrollment();
        const file = await this.reads.findAuthorizedAvatar(context, fileId);
        if (!file) throw new NotFoundDomainException('Avatar not found');
        return file;
      },
      () => new NotFoundDomainException('Avatar not found'),
      { ...request, disposition: 'inline' },
    );
  }
}
