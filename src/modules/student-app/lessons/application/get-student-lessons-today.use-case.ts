import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { parseStudentScheduleDate } from '../../schedule/application/student-schedule-date';
import { StudentLessonsTodayResponseDto } from '../dto/student-lessons-response.dto';
import { StudentLessonsReadAdapter } from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonsPresenter } from '../presenters/student-lessons.presenter';

@Injectable()
export class GetStudentLessonsTodayUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly lessonsReadAdapter: StudentLessonsReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<StudentLessonsTodayResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const lessonDate = parseStudentScheduleDate(params.date);
    const items = await this.lessonsReadAdapter.listItemsForStudentOnDate({
      context,
      date: lessonDate.utcDate,
    });

    return StudentLessonsPresenter.presentToday({
      date: lessonDate,
      items,
    });
  }
}
