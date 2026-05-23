import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherDailyScheduleResponseDto } from '../dto/teacher-schedule.dto';
import { TeacherScheduleReadAdapter } from '../infrastructure/teacher-schedule-read.adapter';
import { TeacherSchedulePresenter } from '../presenters/teacher-schedule.presenter';
import { parseTeacherScheduleDate } from './teacher-schedule-date';

@Injectable()
export class GetTeacherDailyScheduleUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly scheduleReadAdapter: TeacherScheduleReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<TeacherDailyScheduleResponseDto> {
    const teacherContext = this.accessService.assertCurrentTeacher();
    const scheduleDate = parseTeacherScheduleDate(params.date);
    const allocationIds =
      await this.accessService.listOwnedTeacherAllocationIds();
    const entries =
      await this.scheduleReadAdapter.listPublishedEntriesForTeacherOnDay({
        teacherUserId: teacherContext.teacherUserId,
        allocationIds,
        dayOfWeek: scheduleDate.dayOfWeek,
        date: scheduleDate.utcDate,
      });

    return TeacherSchedulePresenter.presentDaily({
      date: scheduleDate,
      entries,
    });
  }
}
