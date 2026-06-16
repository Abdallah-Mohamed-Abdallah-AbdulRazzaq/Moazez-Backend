import { Injectable } from '@nestjs/common';
import { GetAppCalendarEventUseCase } from '../../../academics/calendar/app-facing/application/get-app-calendar-event.use-case';
import { AppCalendarEventResponseDto } from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { AppCalendarVisibilityService } from '../../../academics/calendar/app-facing/visibility/app-calendar-visibility.service';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';

@Injectable()
export class GetTeacherCalendarEventUseCase {
  constructor(
    private readonly teacherAppAccessService: TeacherAppAccessService,
    private readonly appCalendarVisibilityService: AppCalendarVisibilityService,
    private readonly getAppCalendarEventUseCase: GetAppCalendarEventUseCase,
  ) {}

  async execute(eventId: string): Promise<AppCalendarEventResponseDto> {
    const teacherContext =
      this.teacherAppAccessService.assertCurrentTeacher();
    const allocations =
      await this.teacherAppAccessService.listOwnedTeacherAllocations();
    const visibility =
      this.appCalendarVisibilityService.buildTeacherVisibilityContext({
        schoolId: teacherContext.schoolId,
        allocations,
      });

    return this.getAppCalendarEventUseCase.execute({ eventId, visibility });
  }
}
