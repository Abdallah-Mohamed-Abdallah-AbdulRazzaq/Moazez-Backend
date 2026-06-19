import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentHeroBadgesResponseDto } from '../dto/parent-hero.dto';
import { ParentHeroReadAdapter } from '../infrastructure/parent-hero-read.adapter';
import { ParentHeroPresenter } from '../presenters/parent-hero.presenter';

@Injectable()
export class ListParentChildHeroBadgesUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHeroReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentHeroBadgesResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const badges = await this.readAdapter.listBadges(child);

    return ParentHeroPresenter.presentBadges(child, badges);
  }
}
