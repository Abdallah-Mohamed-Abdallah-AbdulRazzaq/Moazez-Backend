import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../shared/teacher-app.types';
import { TeacherAppCompositionReadAdapter } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import { TeacherClassDetailResponseDto } from '../dto/teacher-my-classes.dto';
import { TeacherClassPresenter } from '../presenters/teacher-class.presenter';

@Injectable()
export class GetTeacherClassDetailUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly compositionReadAdapter: TeacherAppCompositionReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
  ): Promise<TeacherClassDetailResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const metrics = await this.compositionReadAdapter.buildClassMetrics([
      allocation,
    ]);

    return TeacherClassPresenter.presentDetail({
      allocation,
      metric: metrics.get(allocation.id),
    });
  }
}
