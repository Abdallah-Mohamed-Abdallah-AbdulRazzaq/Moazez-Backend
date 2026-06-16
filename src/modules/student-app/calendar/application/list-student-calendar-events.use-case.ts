import { Injectable } from '@nestjs/common';
import { ListAppCalendarEventsUseCase } from '../../../academics/calendar/app-facing/application/list-app-calendar-events.use-case';
import { AppCalendarEventsQueryDto } from '../../../academics/calendar/app-facing/dto/app-calendar-events-query.dto';
import { AppCalendarEventsListResponseDto } from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { AppCalendarVisibilityService } from '../../../academics/calendar/app-facing/visibility/app-calendar-visibility.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppClassroomNotFoundException } from '../../shared/student-app-errors';

@Injectable()
export class ListStudentCalendarEventsUseCase {
  constructor(
    private readonly studentAppAccessService: StudentAppAccessService,
    private readonly appCalendarVisibilityService: AppCalendarVisibilityService,
    private readonly listAppCalendarEventsUseCase: ListAppCalendarEventsUseCase,
  ) {}

  async execute(
    query: AppCalendarEventsQueryDto,
  ): Promise<AppCalendarEventsListResponseDto> {
    const { context } =
      await this.studentAppAccessService.getCurrentStudentWithEnrollment();
    const classroomScope =
      await this.appCalendarVisibilityService.findClassroomScope(
        context.classroomId,
      );
    if (!classroomScope) {
      throw new StudentAppClassroomNotFoundException({
        classroomId: context.classroomId,
      });
    }

    const visibility =
      this.appCalendarVisibilityService.buildStudentVisibilityContext({
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        classroomScope,
      });

    return this.listAppCalendarEventsUseCase.execute({ visibility, query });
  }
}
