import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  buildTeacherScheduleWeek,
  DEFAULT_TEACHER_SCHEDULE_WEEK_START_DAY,
  parseTeacherScheduleDate,
} from '../../schedule/application/teacher-schedule-date';
import { TeacherLessonPreparationWeekResponseDto } from '../dto/teacher-lesson-preparation-response.dto';
import { TeacherLessonPreparationReadAdapter } from '../infrastructure/teacher-lesson-preparation-read.adapter';
import { TeacherLessonPreparationPresenter } from '../presenters/teacher-lesson-preparation.presenter';

@Injectable()
export class GetTeacherLessonPreparationWeekUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherLessonPreparationReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<TeacherLessonPreparationWeekResponseDto> {
    const teacherContext = this.accessService.assertCurrentTeacher();
    const date = parseTeacherScheduleDate(params.date);
    const week = buildTeacherScheduleWeek(
      date,
      DEFAULT_TEACHER_SCHEDULE_WEEK_START_DAY,
    );
    const allocationIds =
      await this.accessService.listOwnedTeacherAllocationIds();
    const items = await this.readAdapter.listItemsForTeacherDateRange({
      teacherUserId: teacherContext.teacherUserId,
      schoolId: teacherContext.schoolId,
      allocationIds,
      from: week.days[0].utcDate,
      to: week.days[6].utcDate,
    });

    return TeacherLessonPreparationPresenter.presentWeek({ week, items });
  }
}
