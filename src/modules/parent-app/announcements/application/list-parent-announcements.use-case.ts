import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentAnnouncementsListResponseDto,
  ParentAnnouncementsQueryDto,
} from '../dto/parent-announcements.dto';
import { ParentAnnouncementsReadAdapter } from '../infrastructure/parent-announcements-read.adapter';
import { ParentAnnouncementsPresenter } from '../presenters/parent-announcements.presenter';

@Injectable()
export class ListParentAnnouncementsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentAnnouncementsReadAdapter,
  ) {}

  async execute(
    query?: ParentAnnouncementsQueryDto,
  ): Promise<ParentAnnouncementsListResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const result = await this.readAdapter.listAnnouncements({
      context,
      query,
    });

    return ParentAnnouncementsPresenter.presentList(result);
  }
}
