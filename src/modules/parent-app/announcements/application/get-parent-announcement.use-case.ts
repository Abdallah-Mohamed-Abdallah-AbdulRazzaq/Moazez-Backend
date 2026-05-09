import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAnnouncementResponseDto } from '../dto/parent-announcements.dto';
import { ParentAnnouncementsReadAdapter } from '../infrastructure/parent-announcements-read.adapter';
import { ParentAnnouncementsPresenter } from '../presenters/parent-announcements.presenter';

@Injectable()
export class GetParentAnnouncementUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentAnnouncementsReadAdapter,
  ) {}

  async execute(
    announcementId: string,
  ): Promise<ParentAnnouncementResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const announcement = await this.readAdapter.findAnnouncement({
      context,
      announcementId,
    });

    if (!announcement) {
      throw new NotFoundDomainException('Parent App announcement not found', {
        announcementId,
      });
    }

    return ParentAnnouncementsPresenter.presentAnnouncement(announcement);
  }
}
