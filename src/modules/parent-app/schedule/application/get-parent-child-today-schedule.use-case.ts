import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppChildNotFoundException } from '../../shared/parent-app-errors';
import { ParentChildTodayScheduleResponseDto } from '../dto/parent-schedule.dto';
import { ParentScheduleReadAdapter } from '../infrastructure/parent-schedule-read.adapter';
import { ParentSchedulePresenter } from '../presenters/parent-schedule.presenter';
import { ParentScheduleClock } from './parent-schedule-date';

@Injectable()
export class GetParentChildTodayScheduleUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly scheduleReadAdapter: ParentScheduleReadAdapter,
    private readonly clock: ParentScheduleClock,
  ) {}

  async execute(
    studentId: string,
  ): Promise<ParentChildTodayScheduleResponseDto> {
    const accessibleChild =
      await this.accessService.getAccessibleChild(studentId);
    const scheduleDate = this.clock.currentDate();
    const child =
      await this.scheduleReadAdapter.findChildSummary(accessibleChild);

    if (!child) {
      throw new ParentAppChildNotFoundException({
        studentId,
        reason: 'parent_schedule_child_missing',
      });
    }

    const entries =
      await this.scheduleReadAdapter.listPublishedEntriesForChildOnDay({
        classroomId: accessibleChild.classroomId,
        academicYearId: accessibleChild.academicYearId,
        termId: accessibleChild.termId,
        dayOfWeek: scheduleDate.dayOfWeek,
        date: scheduleDate.utcDate,
      });

    return ParentSchedulePresenter.presentToday({
      date: scheduleDate,
      child,
      entries,
    });
  }
}
