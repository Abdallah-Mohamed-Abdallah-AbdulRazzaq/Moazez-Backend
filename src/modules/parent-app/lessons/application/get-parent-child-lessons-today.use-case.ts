import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { parseParentScheduleDate } from '../../schedule/application/parent-schedule-date';
import { ParentChildLessonsTodayResponseDto } from '../dto/parent-child-lessons-response.dto';
import { ParentChildLessonsReadAdapter } from '../infrastructure/parent-child-lessons-read.adapter';
import { ParentChildLessonsPresenter } from '../presenters/parent-child-lessons.presenter';

@Injectable()
export class GetParentChildLessonsTodayUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly lessonsReadAdapter: ParentChildLessonsReadAdapter,
  ) {}

  async execute(params: {
    studentId: string;
    date: string;
  }): Promise<ParentChildLessonsTodayResponseDto> {
    const child = await this.accessService.getAccessibleChild(params.studentId);
    const lessonDate = parseParentScheduleDate(params.date);
    const items = await this.lessonsReadAdapter.listItemsForChildOnDate({
      child,
      date: lessonDate.utcDate,
    });

    return ParentChildLessonsPresenter.presentToday({
      child,
      date: lessonDate,
      items,
    });
  }
}
