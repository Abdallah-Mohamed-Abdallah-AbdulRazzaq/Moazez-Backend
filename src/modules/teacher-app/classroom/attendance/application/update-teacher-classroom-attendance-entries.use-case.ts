import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  TeacherClassroomAttendanceSessionResponseDto,
  UpdateTeacherClassroomAttendanceEntriesDto,
} from '../dto/teacher-classroom-attendance.dto';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';
import { TeacherClassroomAttendancePresenter } from '../presenters/teacher-classroom-attendance.presenter';

@Injectable()
export class UpdateTeacherClassroomAttendanceEntriesUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly attendanceAdapter: TeacherClassroomAttendanceAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    sessionId: string,
    body: UpdateTeacherClassroomAttendanceEntriesDto,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const result = await this.attendanceAdapter.updateEntries({
      allocation,
      sessionId,
      entries: body.entries,
    });

    return TeacherClassroomAttendancePresenter.presentSession({
      classId: allocation.id,
      result,
    });
  }
}
