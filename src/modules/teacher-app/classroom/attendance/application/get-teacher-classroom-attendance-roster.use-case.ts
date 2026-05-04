import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  GetTeacherClassroomAttendanceRosterQueryDto,
  TeacherClassroomAttendanceRosterResponseDto,
} from '../dto/teacher-classroom-attendance.dto';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';
import { TeacherClassroomAttendancePresenter } from '../presenters/teacher-classroom-attendance.presenter';

@Injectable()
export class GetTeacherClassroomAttendanceRosterUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly attendanceAdapter: TeacherClassroomAttendanceAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    query: GetTeacherClassroomAttendanceRosterQueryDto,
  ): Promise<TeacherClassroomAttendanceRosterResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const roster = await this.attendanceAdapter.getRoster({
      allocation,
      date: query.date,
    });

    return TeacherClassroomAttendancePresenter.presentRoster({
      classId: allocation.id,
      date: query.date,
      roster,
      filters: query,
    });
  }
}
