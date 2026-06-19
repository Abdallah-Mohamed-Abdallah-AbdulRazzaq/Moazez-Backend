import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CompleteHeroMissionUseCase } from '../../../reinforcement/hero-journey/application/hero-journey-progress.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHeroMissionDetailResponseDto } from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class CompleteStudentHeroMissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
    private readonly completeHeroMissionUseCase: CompleteHeroMissionUseCase,
  ) {}

  async execute(missionId: string): Promise<StudentHeroMissionDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const visibleMission = await this.readAdapter.findMission({
      context,
      missionId,
    });
    if (!visibleMission?.progress) {
      throw new NotFoundDomainException('Student App hero mission not found', {
        missionId,
      });
    }

    await this.completeHeroMissionUseCase.execute(
      visibleMission.progress.id,
      {},
    );

    const refreshed = await this.readAdapter.findMission({
      context,
      missionId,
    });
    if (!refreshed) {
      throw new NotFoundDomainException('Student App hero mission not found', {
        missionId,
      });
    }

    return StudentHeroPresenter.presentMissionDetail(refreshed);
  }
}
