import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomAttendanceTodayResponseDto } from '../dto/teacher-classroom-attendance.dto';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';
import { TeacherClassroomAttendancePresenter } from '../presenters/teacher-classroom-attendance.presenter';

export interface GetTeacherClassroomAttendanceTodayQuery {
  date: string;
}

@Injectable()
export class GetTeacherClassroomAttendanceTodayUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly attendanceAdapter: TeacherClassroomAttendanceAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    query: GetTeacherClassroomAttendanceTodayQuery,
  ): Promise<TeacherClassroomAttendanceTodayResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const roster = await this.attendanceAdapter.getRoster({
      allocation,
      date: query.date,
    });

    return TeacherClassroomAttendancePresenter.presentToday({
      classId: allocation.id,
      date: query.date,
      roster,
    });
  }
}
