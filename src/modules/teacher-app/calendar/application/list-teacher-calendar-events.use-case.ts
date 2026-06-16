import { Injectable } from '@nestjs/common';
import { ListAppCalendarEventsUseCase } from '../../../academics/calendar/app-facing/application/list-app-calendar-events.use-case';
import { AppCalendarEventsQueryDto } from '../../../academics/calendar/app-facing/dto/app-calendar-events-query.dto';
import { AppCalendarEventsListResponseDto } from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { AppCalendarVisibilityService } from '../../../academics/calendar/app-facing/visibility/app-calendar-visibility.service';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';

@Injectable()
export class ListTeacherCalendarEventsUseCase {
  constructor(
    private readonly teacherAppAccessService: TeacherAppAccessService,
    private readonly appCalendarVisibilityService: AppCalendarVisibilityService,
    private readonly listAppCalendarEventsUseCase: ListAppCalendarEventsUseCase,
  ) {}

  async execute(
    query: AppCalendarEventsQueryDto,
  ): Promise<AppCalendarEventsListResponseDto> {
    const teacherContext =
      this.teacherAppAccessService.assertCurrentTeacher();
    const allocations =
      await this.teacherAppAccessService.listOwnedTeacherAllocations();
    const visibility =
      this.appCalendarVisibilityService.buildTeacherVisibilityContext({
        schoolId: teacherContext.schoolId,
        allocations,
      });

    return this.listAppCalendarEventsUseCase.execute({ visibility, query });
  }
}
