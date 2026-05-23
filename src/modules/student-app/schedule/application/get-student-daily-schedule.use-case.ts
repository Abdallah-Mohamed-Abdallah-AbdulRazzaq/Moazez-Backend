import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentDailyScheduleResponseDto } from '../dto/student-schedule.dto';
import { StudentScheduleReadAdapter } from '../infrastructure/student-schedule-read.adapter';
import { StudentSchedulePresenter } from '../presenters/student-schedule.presenter';
import { parseStudentScheduleDate } from './student-schedule-date';

@Injectable()
export class GetStudentDailyScheduleUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly scheduleReadAdapter: StudentScheduleReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<StudentDailyScheduleResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const scheduleDate = parseStudentScheduleDate(params.date);
    const entries =
      await this.scheduleReadAdapter.listPublishedEntriesForStudentOnDay({
        classroomId: context.classroomId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        dayOfWeek: scheduleDate.dayOfWeek,
        date: scheduleDate.utcDate,
      });

    return StudentSchedulePresenter.presentDaily({
      date: scheduleDate,
      entries,
    });
  }
}
