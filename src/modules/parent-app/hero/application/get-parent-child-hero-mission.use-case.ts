import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentHeroMissionDetailResponseDto } from '../dto/parent-hero.dto';
import { ParentHeroReadAdapter } from '../infrastructure/parent-hero-read.adapter';
import { ParentHeroPresenter } from '../presenters/parent-hero.presenter';

@Injectable()
export class GetParentChildHeroMissionUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHeroReadAdapter,
  ) {}

  async execute(
    studentId: string,
    missionId: string,
  ): Promise<ParentHeroMissionDetailResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.findMission({ child, missionId });

    if (!result) {
      throw new NotFoundDomainException('Parent App hero mission not found', {
        studentId,
        missionId,
      });
    }

    return ParentHeroPresenter.presentMissionDetail(result);
  }
}
