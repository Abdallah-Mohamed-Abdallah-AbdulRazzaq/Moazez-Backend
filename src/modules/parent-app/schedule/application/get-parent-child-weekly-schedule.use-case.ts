import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppChildNotFoundException } from '../../shared/parent-app-errors';
import { ParentChildWeeklyScheduleResponseDto } from '../dto/parent-schedule.dto';
import { ParentScheduleReadAdapter } from '../infrastructure/parent-schedule-read.adapter';
import { ParentSchedulePresenter } from '../presenters/parent-schedule.presenter';
import {
  buildParentScheduleWeek,
  DEFAULT_PARENT_SCHEDULE_WEEK_START_DAY,
  ParentScheduleClock,
} from './parent-schedule-date';

@Injectable()
export class GetParentChildWeeklyScheduleUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly scheduleReadAdapter: ParentScheduleReadAdapter,
    private readonly clock: ParentScheduleClock,
  ) {}

  async execute(
    studentId: string,
  ): Promise<ParentChildWeeklyScheduleResponseDto> {
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

    const settings =
      await this.scheduleReadAdapter.findPublishedScheduleSettings({
        classroomId: accessibleChild.classroomId,
        academicYearId: accessibleChild.academicYearId,
        termId: accessibleChild.termId,
      });
    const week = buildParentScheduleWeek(
      scheduleDate,
      settings?.weekStartDay ?? DEFAULT_PARENT_SCHEDULE_WEEK_START_DAY,
    );
    const entries =
      await this.scheduleReadAdapter.listPublishedEntriesForChildWeek({
        classroomId: accessibleChild.classroomId,
        academicYearId: accessibleChild.academicYearId,
        termId: accessibleChild.termId,
        dayOfWeeks: week.days.map((day) => day.dayOfWeek),
        weekStartDate: week.days[0].utcDate,
        weekEndDate: week.days[6].utcDate,
      });

    return ParentSchedulePresenter.presentWeekly({
      week,
      child,
      entries,
    });
  }
}
