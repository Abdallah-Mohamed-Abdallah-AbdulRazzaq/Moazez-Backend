import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentWeeklyScheduleResponseDto } from '../dto/student-schedule.dto';
import { StudentScheduleReadAdapter } from '../infrastructure/student-schedule-read.adapter';
import { StudentSchedulePresenter } from '../presenters/student-schedule.presenter';
import {
  buildStudentScheduleWeek,
  DEFAULT_STUDENT_SCHEDULE_WEEK_START_DAY,
  parseStudentScheduleDate,
} from './student-schedule-date';

@Injectable()
export class GetStudentWeeklyScheduleUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly scheduleReadAdapter: StudentScheduleReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<StudentWeeklyScheduleResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const scheduleDate = parseStudentScheduleDate(params.date);
    const settings =
      await this.scheduleReadAdapter.findPublishedScheduleSettings({
        classroomId: context.classroomId,
        academicYearId: context.academicYearId,
        termId: context.termId,
      });

    const week = buildStudentScheduleWeek(
      scheduleDate,
      settings?.weekStartDay ?? DEFAULT_STUDENT_SCHEDULE_WEEK_START_DAY,
    );
    const entries =
      await this.scheduleReadAdapter.listPublishedEntriesForStudentWeek({
        classroomId: context.classroomId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        dayOfWeeks: week.days.map((day) => day.dayOfWeek),
        weekStartDate: week.days[0].utcDate,
        weekEndDate: week.days[6].utcDate,
      });

    return StudentSchedulePresenter.presentWeekly({ week, entries });
  }
}
