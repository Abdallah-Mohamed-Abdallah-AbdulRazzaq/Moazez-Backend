import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentLessonNotFoundException } from '../domain/student-lessons.errors';
import { StudentLessonItemDto } from '../dto/student-lessons-response.dto';
import { StudentLessonsReadAdapter } from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonsPresenter } from '../presenters/student-lessons.presenter';

@Injectable()
export class GetStudentLessonDetailUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly lessonsReadAdapter: StudentLessonsReadAdapter,
  ) {}

  async execute(lessonPlanItemId: string): Promise<StudentLessonItemDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const item = await this.lessonsReadAdapter.findVisibleItemById({
      context,
      itemId: lessonPlanItemId,
    });

    if (!item) {
      throw new StudentLessonNotFoundException();
    }

    return StudentLessonsPresenter.presentItem(item);
  }
}
