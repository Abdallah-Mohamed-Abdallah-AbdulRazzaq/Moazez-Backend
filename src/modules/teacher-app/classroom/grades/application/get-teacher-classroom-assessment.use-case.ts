import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import { TeacherClassroomAssessmentDetailResponseDto } from '../dto/teacher-classroom-grades.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomGradesPresenter } from '../presenters/teacher-classroom-grades.presenter';

@Injectable()
export class GetTeacherClassroomAssessmentUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assessmentId: string,
  ): Promise<TeacherClassroomAssessmentDetailResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const result = await this.gradesReadAdapter.getAssessmentDetail({
      allocation,
      assessmentId,
    });

    return TeacherClassroomGradesPresenter.presentAssessmentDetail({
      classId: allocation.id,
      result,
    });
  }
}
