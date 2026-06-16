import { Injectable } from '@nestjs/common';
import { GetAppCalendarEventUseCase } from '../../../academics/calendar/app-facing/application/get-app-calendar-event.use-case';
import { AppCalendarEventResponseDto } from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { AppCalendarVisibilityService } from '../../../academics/calendar/app-facing/visibility/app-calendar-visibility.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppClassroomNotFoundException } from '../../shared/parent-app-errors';

@Injectable()
export class GetParentCalendarEventUseCase {
  constructor(
    private readonly parentAppAccessService: ParentAppAccessService,
    private readonly appCalendarVisibilityService: AppCalendarVisibilityService,
    private readonly getAppCalendarEventUseCase: GetAppCalendarEventUseCase,
  ) {}

  async execute(params: {
    studentId: string;
    eventId: string;
  }): Promise<AppCalendarEventResponseDto> {
    const accessibleChild = await this.parentAppAccessService.getAccessibleChild(
      params.studentId,
    );
    const parentContext =
      await this.parentAppAccessService.assertCurrentParent();
    const classroomScope =
      await this.appCalendarVisibilityService.findClassroomScope(
        accessibleChild.classroomId,
      );
    if (!classroomScope) {
      throw new ParentAppClassroomNotFoundException({
        classroomId: accessibleChild.classroomId,
      });
    }

    const visibility =
      this.appCalendarVisibilityService.buildParentVisibilityContext({
        schoolId: parentContext.schoolId,
        academicYearId: accessibleChild.academicYearId,
        termId: accessibleChild.termId,
        classroomScope,
      });

    return this.getAppCalendarEventUseCase.execute({
      eventId: params.eventId,
      visibility,
    });
  }
}
