import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHeroMissionDetailResponseDto } from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class GetStudentHeroMissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
  ) {}

  async execute(
    missionId: string,
  ): Promise<StudentHeroMissionDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.findMission({ context, missionId });

    if (!result) {
      throw new NotFoundDomainException('Student App hero mission not found', {
        missionId,
      });
    }

    return StudentHeroPresenter.presentMissionDetail(result);
  }
}
