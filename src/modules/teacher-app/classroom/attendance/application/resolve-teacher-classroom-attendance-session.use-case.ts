import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  ResolveTeacherClassroomAttendanceSessionDto,
  TeacherClassroomAttendanceSessionResponseDto,
} from '../dto/teacher-classroom-attendance.dto';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';
import { TeacherClassroomAttendancePresenter } from '../presenters/teacher-classroom-attendance.presenter';

@Injectable()
export class ResolveTeacherClassroomAttendanceSessionUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly attendanceAdapter: TeacherClassroomAttendanceAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    body: ResolveTeacherClassroomAttendanceSessionDto,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const result = await this.attendanceAdapter.resolveSession({
      allocation,
      date: body.date,
    });

    return TeacherClassroomAttendancePresenter.presentSession({
      classId: allocation.id,
      result,
    });
  }
}
