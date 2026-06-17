import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  buildParentScheduleWeek,
  DEFAULT_PARENT_SCHEDULE_WEEK_START_DAY,
  parseParentScheduleDate,
} from '../../schedule/application/parent-schedule-date';
import { ParentScheduleReadAdapter } from '../../schedule/infrastructure/parent-schedule-read.adapter';
import { ParentChildLessonsWeekResponseDto } from '../dto/parent-child-lessons-response.dto';
import { ParentChildLessonsReadAdapter } from '../infrastructure/parent-child-lessons-read.adapter';
import { ParentChildLessonsPresenter } from '../presenters/parent-child-lessons.presenter';

@Injectable()
export class GetParentChildLessonsWeekUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly lessonsReadAdapter: ParentChildLessonsReadAdapter,
    private readonly scheduleReadAdapter: ParentScheduleReadAdapter,
  ) {}

  async execute(params: {
    studentId: string;
    date: string;
  }): Promise<ParentChildLessonsWeekResponseDto> {
    const child = await this.accessService.getAccessibleChild(params.studentId);
    const lessonDate = parseParentScheduleDate(params.date);
    const settings =
      await this.scheduleReadAdapter.findPublishedScheduleSettings({
        classroomId: child.classroomId,
        academicYearId: child.academicYearId,
        termId: child.termId,
      });
    const week = buildParentScheduleWeek(
      lessonDate,
      settings?.weekStartDay ?? DEFAULT_PARENT_SCHEDULE_WEEK_START_DAY,
    );
    const items = await this.lessonsReadAdapter.listItemsForChildDateRange({
      child,
      from: week.days[0].utcDate,
      to: week.days[6].utcDate,
    });

    return ParentChildLessonsPresenter.presentWeek({
      child,
      week,
      items,
    });
  }
}
