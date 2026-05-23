import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherWeeklyScheduleResponseDto } from '../dto/teacher-schedule.dto';
import { TeacherScheduleReadAdapter } from '../infrastructure/teacher-schedule-read.adapter';
import { TeacherSchedulePresenter } from '../presenters/teacher-schedule.presenter';
import {
  buildTeacherScheduleWeek,
  DEFAULT_TEACHER_SCHEDULE_WEEK_START_DAY,
  parseTeacherScheduleDate,
} from './teacher-schedule-date';

@Injectable()
export class GetTeacherWeeklyScheduleUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly scheduleReadAdapter: TeacherScheduleReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<TeacherWeeklyScheduleResponseDto> {
    const teacherContext = this.accessService.assertCurrentTeacher();
    const scheduleDate = parseTeacherScheduleDate(params.date);
    const allocationIds =
      await this.accessService.listOwnedTeacherAllocationIds();
    const settings =
      await this.scheduleReadAdapter.findPublishedScheduleSettings({
        teacherUserId: teacherContext.teacherUserId,
        allocationIds,
      });

    const week = buildTeacherScheduleWeek(
      scheduleDate,
      settings?.weekStartDay ?? DEFAULT_TEACHER_SCHEDULE_WEEK_START_DAY,
    );
    const entries =
      await this.scheduleReadAdapter.listPublishedEntriesForTeacherWeek({
        teacherUserId: teacherContext.teacherUserId,
        allocationIds,
        dayOfWeeks: week.days.map((day) => day.dayOfWeek),
        weekStartDate: week.days[0].utcDate,
        weekEndDate: week.days[6].utcDate,
      });

    return TeacherSchedulePresenter.presentWeekly({ week, entries });
  }
}
