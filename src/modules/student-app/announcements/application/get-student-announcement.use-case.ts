import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAnnouncementResponseDto } from '../dto/student-announcements.dto';
import { StudentAnnouncementsReadAdapter } from '../infrastructure/student-announcements-read.adapter';
import { StudentAnnouncementsPresenter } from '../presenters/student-announcements.presenter';

@Injectable()
export class GetStudentAnnouncementUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentAnnouncementsReadAdapter,
  ) {}

  async execute(announcementId: string): Promise<StudentAnnouncementResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const announcement = await this.readAdapter.findAnnouncement({
      context,
      announcementId,
    });

    if (!announcement) {
      throw new NotFoundDomainException(
        'Student App announcement not found',
        { announcementId },
      );
    }

    return StudentAnnouncementsPresenter.presentAnnouncement(announcement);
  }
}
