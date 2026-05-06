import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAnnouncementAttachmentsResponseDto } from '../dto/student-announcements.dto';
import { StudentAnnouncementsReadAdapter } from '../infrastructure/student-announcements-read.adapter';
import { StudentAnnouncementsPresenter } from '../presenters/student-announcements.presenter';

@Injectable()
export class ListStudentAnnouncementAttachmentsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentAnnouncementsReadAdapter,
  ) {}

  async execute(
    announcementId: string,
  ): Promise<StudentAnnouncementAttachmentsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const attachments = await this.readAdapter.listAttachments({
      context,
      announcementId,
    });

    if (!attachments) {
      throw new NotFoundDomainException(
        'Student App announcement not found',
        { announcementId },
      );
    }

    return StudentAnnouncementsPresenter.presentAttachments({
      announcementId,
      attachments,
    });
  }
}
