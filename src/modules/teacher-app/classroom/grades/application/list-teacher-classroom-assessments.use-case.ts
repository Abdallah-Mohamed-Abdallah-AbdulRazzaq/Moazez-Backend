import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  ListTeacherClassroomAssessmentsQueryDto,
  TeacherClassroomAssessmentsListResponseDto,
} from '../dto/teacher-classroom-grades.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomGradesPresenter } from '../presenters/teacher-classroom-grades.presenter';

@Injectable()
export class ListTeacherClassroomAssessmentsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    query: ListTeacherClassroomAssessmentsQueryDto,
  ): Promise<TeacherClassroomAssessmentsListResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const result = await this.gradesReadAdapter.listAssessments({
      allocation,
      filters: query,
    });

    return TeacherClassroomGradesPresenter.presentAssessmentList({
      classId: allocation.id,
      result,
    });
  }
}
