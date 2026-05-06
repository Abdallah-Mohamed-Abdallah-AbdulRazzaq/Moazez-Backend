import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAnnouncementReadResponseDto } from '../dto/student-announcements.dto';
import { StudentAnnouncementsReadAdapter } from '../infrastructure/student-announcements-read.adapter';
import { StudentAnnouncementsPresenter } from '../presenters/student-announcements.presenter';

@Injectable()
export class MarkStudentAnnouncementReadUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentAnnouncementsReadAdapter,
  ) {}

  async execute(
    announcementId: string,
  ): Promise<StudentAnnouncementReadResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.markAnnouncementRead({
      context,
      announcementId,
    });

    if (!result) {
      throw new NotFoundDomainException(
        'Student App announcement not found',
        { announcementId },
      );
    }

    return StudentAnnouncementsPresenter.presentReadResult(result);
  }
}
