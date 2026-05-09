import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAnnouncementReadResponseDto } from '../dto/parent-announcements.dto';
import { ParentAnnouncementsReadAdapter } from '../infrastructure/parent-announcements-read.adapter';
import { ParentAnnouncementsPresenter } from '../presenters/parent-announcements.presenter';

@Injectable()
export class MarkParentAnnouncementReadUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentAnnouncementsReadAdapter,
  ) {}

  async execute(
    announcementId: string,
  ): Promise<ParentAnnouncementReadResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const result = await this.readAdapter.markAnnouncementRead({
      context,
      announcementId,
    });

    if (!result) {
      throw new NotFoundDomainException('Parent App announcement not found', {
        announcementId,
      });
    }

    return ParentAnnouncementsPresenter.presentReadResult(result);
  }
}
