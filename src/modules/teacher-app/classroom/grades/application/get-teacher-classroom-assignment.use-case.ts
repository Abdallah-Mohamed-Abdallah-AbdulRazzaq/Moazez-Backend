import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomAssignmentDetailResponseDto } from '../dto/teacher-classroom-grades.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomGradesPresenter } from '../presenters/teacher-classroom-grades.presenter';

@Injectable()
export class GetTeacherClassroomAssignmentUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assignmentId: string,
  ): Promise<TeacherClassroomAssignmentDetailResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const result = await this.gradesReadAdapter.findOwnedAssignmentDetail({
      allocation,
      assignmentId,
    });

    return TeacherClassroomGradesPresenter.presentAssignmentDetail({
      classId: allocation.id,
      result,
    });
  }
}
