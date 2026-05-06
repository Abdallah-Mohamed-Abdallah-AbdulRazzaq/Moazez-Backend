import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHeroProgressResponseDto } from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class GetStudentHeroProgressUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
  ) {}

  async execute(): Promise<StudentHeroProgressResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.getHeroProgress(context);

    return StudentHeroPresenter.presentProgress(result);
  }
}
