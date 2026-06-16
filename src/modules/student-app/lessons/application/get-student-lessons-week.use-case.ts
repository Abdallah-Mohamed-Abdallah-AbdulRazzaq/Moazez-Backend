import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  buildStudentScheduleWeek,
  DEFAULT_STUDENT_SCHEDULE_WEEK_START_DAY,
  parseStudentScheduleDate,
} from '../../schedule/application/student-schedule-date';
import { StudentScheduleReadAdapter } from '../../schedule/infrastructure/student-schedule-read.adapter';
import { StudentLessonsWeekResponseDto } from '../dto/student-lessons-response.dto';
import { StudentLessonsReadAdapter } from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonsPresenter } from '../presenters/student-lessons.presenter';

@Injectable()
export class GetStudentLessonsWeekUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly lessonsReadAdapter: StudentLessonsReadAdapter,
    private readonly scheduleReadAdapter: StudentScheduleReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<StudentLessonsWeekResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const lessonDate = parseStudentScheduleDate(params.date);
    const settings =
      await this.scheduleReadAdapter.findPublishedScheduleSettings({
        classroomId: context.classroomId,
        academicYearId: context.academicYearId,
        termId: context.termId,
      });
    const week = buildStudentScheduleWeek(
      lessonDate,
      settings?.weekStartDay ?? DEFAULT_STUDENT_SCHEDULE_WEEK_START_DAY,
    );
    const items = await this.lessonsReadAdapter.listItemsForStudentDateRange({
      context,
      from: week.days[0].utcDate,
      to: week.days[6].utcDate,
    });

    return StudentLessonsPresenter.presentWeek({ week, items });
  }
}
