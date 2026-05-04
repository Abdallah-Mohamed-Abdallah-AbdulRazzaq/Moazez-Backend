import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomAttendanceSessionResponseDto } from '../dto/teacher-classroom-attendance.dto';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';
import { TeacherClassroomAttendancePresenter } from '../presenters/teacher-classroom-attendance.presenter';

@Injectable()
export class GetTeacherClassroomAttendanceSessionUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly attendanceAdapter: TeacherClassroomAttendanceAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    sessionId: string,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const result = await this.attendanceAdapter.getSession({
      allocation,
      sessionId,
    });

    return TeacherClassroomAttendancePresenter.presentSession({
      classId: allocation.id,
      result,
    });
  }
}
