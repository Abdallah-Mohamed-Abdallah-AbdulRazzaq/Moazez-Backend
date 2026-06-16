import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { parseTeacherScheduleDate } from '../../schedule/application/teacher-schedule-date';
import { TeacherLessonPreparationTodayResponseDto } from '../dto/teacher-lesson-preparation-response.dto';
import { TeacherLessonPreparationReadAdapter } from '../infrastructure/teacher-lesson-preparation-read.adapter';
import { TeacherLessonPreparationPresenter } from '../presenters/teacher-lesson-preparation.presenter';

@Injectable()
export class GetTeacherLessonPreparationTodayUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherLessonPreparationReadAdapter,
  ) {}

  async execute(params: {
    date: string;
  }): Promise<TeacherLessonPreparationTodayResponseDto> {
    const teacherContext = this.accessService.assertCurrentTeacher();
    const date = parseTeacherScheduleDate(params.date);
    const allocationIds =
      await this.accessService.listOwnedTeacherAllocationIds();
    const items = await this.readAdapter.listItemsForTeacherOnDate({
      teacherUserId: teacherContext.teacherUserId,
      schoolId: teacherContext.schoolId,
      allocationIds,
      date: date.utcDate,
    });

    return TeacherLessonPreparationPresenter.presentToday({ date, items });
  }
}
