import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentHeroOverviewResponseDto } from '../dto/parent-hero.dto';
import { ParentHeroReadAdapter } from '../infrastructure/parent-hero-read.adapter';
import { ParentHeroPresenter } from '../presenters/parent-hero.presenter';

@Injectable()
export class GetParentChildHeroOverviewUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHeroReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentHeroOverviewResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.getHeroOverview(child);

    return ParentHeroPresenter.presentOverview(result);
  }
}
