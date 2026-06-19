import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentHeroMissionsQueryDto,
  ParentHeroMissionsResponseDto,
} from '../dto/parent-hero.dto';
import { ParentHeroReadAdapter } from '../infrastructure/parent-hero-read.adapter';
import { ParentHeroPresenter } from '../presenters/parent-hero.presenter';

@Injectable()
export class ListParentChildHeroMissionsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHeroReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentHeroMissionsQueryDto,
  ): Promise<ParentHeroMissionsResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listMissions(child, query);

    return ParentHeroPresenter.presentMissions(result);
  }
}
