import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentChildLessonNotFoundException } from '../domain/parent-child-lessons.errors';
import { ParentChildLessonItemDto } from '../dto/parent-child-lessons-response.dto';
import { ParentChildLessonsReadAdapter } from '../infrastructure/parent-child-lessons-read.adapter';
import { ParentChildLessonsPresenter } from '../presenters/parent-child-lessons.presenter';

@Injectable()
export class GetParentChildLessonDetailUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly lessonsReadAdapter: ParentChildLessonsReadAdapter,
  ) {}

  async execute(params: {
    studentId: string;
    lessonPlanItemId: string;
  }): Promise<ParentChildLessonItemDto> {
    const child = await this.accessService.getAccessibleChild(params.studentId);
    const item = await this.lessonsReadAdapter.findVisibleItemById({
      child,
      itemId: params.lessonPlanItemId,
    });

    if (!item) {
      throw new ParentChildLessonNotFoundException();
    }

    return ParentChildLessonsPresenter.presentItem(item);
  }
}
