import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CompleteHeroObjectiveUseCase } from '../../../reinforcement/hero-journey/application/hero-journey-progress.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHeroMissionDetailResponseDto } from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class CompleteStudentHeroObjectiveUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
    private readonly completeHeroObjectiveUseCase: CompleteHeroObjectiveUseCase,
  ) {}

  async execute(params: {
    missionId: string;
    objectiveId: string;
  }): Promise<StudentHeroMissionDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const visibleMission = await this.readAdapter.findMission({
      context,
      missionId: params.missionId,
    });
    if (!visibleMission?.progress) {
      throw new NotFoundDomainException('Student App hero mission not found', {
        missionId: params.missionId,
      });
    }

    const objectiveBelongsToMission = visibleMission.mission.objectives.some(
      (objective) => objective.id === params.objectiveId,
    );
    if (!objectiveBelongsToMission) {
      throw new NotFoundDomainException(
        'Student App hero mission objective not found',
        {
          missionId: params.missionId,
          objectiveId: params.objectiveId,
        },
      );
    }

    await this.completeHeroObjectiveUseCase.execute(
      visibleMission.progress.id,
      params.objectiveId,
      {},
    );

    const refreshed = await this.readAdapter.findMission({
      context,
      missionId: params.missionId,
    });
    if (!refreshed) {
      throw new NotFoundDomainException('Student App hero mission not found', {
        missionId: params.missionId,
      });
    }

    return StudentHeroPresenter.presentMissionDetail(refreshed);
  }
}
