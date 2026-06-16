import { Injectable } from '@nestjs/common';
import { GetAppCalendarEventUseCase } from '../../../academics/calendar/app-facing/application/get-app-calendar-event.use-case';
import { AppCalendarEventResponseDto } from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { AppCalendarVisibilityService } from '../../../academics/calendar/app-facing/visibility/app-calendar-visibility.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppClassroomNotFoundException } from '../../shared/student-app-errors';

@Injectable()
export class GetStudentCalendarEventUseCase {
  constructor(
    private readonly studentAppAccessService: StudentAppAccessService,
    private readonly appCalendarVisibilityService: AppCalendarVisibilityService,
    private readonly getAppCalendarEventUseCase: GetAppCalendarEventUseCase,
  ) {}

  async execute(eventId: string): Promise<AppCalendarEventResponseDto> {
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

    return this.getAppCalendarEventUseCase.execute({ eventId, visibility });
  }
}
