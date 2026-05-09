import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAnnouncementAttachmentsResponseDto } from '../dto/parent-announcements.dto';
import { ParentAnnouncementsReadAdapter } from '../infrastructure/parent-announcements-read.adapter';
import { ParentAnnouncementsPresenter } from '../presenters/parent-announcements.presenter';

@Injectable()
export class ListParentAnnouncementAttachmentsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentAnnouncementsReadAdapter,
  ) {}

  async execute(
    announcementId: string,
  ): Promise<ParentAnnouncementAttachmentsResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const attachments = await this.readAdapter.listAttachments({
      context,
      announcementId,
    });

    if (!attachments) {
      throw new NotFoundDomainException('Parent App announcement not found', {
        announcementId,
      });
    }

    return ParentAnnouncementsPresenter.presentAttachments({
      announcementId,
      attachments,
    });
  }
}
