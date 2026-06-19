import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StartHeroMissionUseCase } from '../../../reinforcement/hero-journey/application/hero-journey-progress.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHeroMissionDetailResponseDto } from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class StartStudentHeroMissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
    private readonly startHeroMissionUseCase: StartHeroMissionUseCase,
  ) {}

  async execute(missionId: string): Promise<StudentHeroMissionDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const visibleMission = await this.readAdapter.findMission({
      context,
      missionId,
    });
    if (!visibleMission) {
      throw new NotFoundDomainException('Student App hero mission not found', {
        missionId,
      });
    }

    await this.startHeroMissionUseCase.execute(context.studentId, missionId, {
      enrollmentId: context.enrollmentId,
    });

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
