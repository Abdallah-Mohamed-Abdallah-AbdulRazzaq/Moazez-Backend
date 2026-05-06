import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentHeroMissionsQueryDto,
  StudentHeroMissionsResponseDto,
} from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class ListStudentHeroMissionsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
  ) {}

  async execute(
    query?: StudentHeroMissionsQueryDto,
  ): Promise<StudentHeroMissionsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listMissions(context, query);

    return StudentHeroPresenter.presentMissions(result);
  }
}
