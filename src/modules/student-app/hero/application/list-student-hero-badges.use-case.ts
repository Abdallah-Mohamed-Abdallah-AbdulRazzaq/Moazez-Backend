import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentHeroBadgesResponseDto } from '../dto/student-hero.dto';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';
import { StudentHeroPresenter } from '../presenters/student-hero.presenter';

@Injectable()
export class ListStudentHeroBadgesUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHeroReadAdapter,
  ) {}

  async execute(): Promise<StudentHeroBadgesResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const badges = await this.readAdapter.listBadges(context);

    return StudentHeroPresenter.presentBadges(badges);
  }
}
