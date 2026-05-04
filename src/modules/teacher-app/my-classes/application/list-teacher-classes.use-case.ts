import { Injectable } from '@nestjs/common';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppCompositionReadAdapter } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import {
  ListTeacherClassesQueryDto,
  TeacherClassesListResponseDto,
} from '../dto/teacher-my-classes.dto';
import { TeacherClassPresenter } from '../presenters/teacher-class.presenter';

@Injectable()
export class ListTeacherClassesUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly compositionReadAdapter: TeacherAppCompositionReadAdapter,
  ) {}

  async execute(
    query: ListTeacherClassesQueryDto,
  ): Promise<TeacherClassesListResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const result = await this.allocationReadAdapter.listOwnedAllocations({
      teacherUserId: context.teacherUserId,
      filters: query,
    });
    const metrics = await this.compositionReadAdapter.buildClassMetrics(
      result.items,
    );

    return TeacherClassPresenter.presentList({
      allocations: result.items,
      metrics,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  }
}
