import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  GetTeacherClassroomGradebookQueryDto,
  TeacherClassroomGradebookResponseDto,
} from '../dto/teacher-classroom-grades.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomGradesPresenter } from '../presenters/teacher-classroom-grades.presenter';

@Injectable()
export class GetTeacherClassroomGradebookUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    query: GetTeacherClassroomGradebookQueryDto,
  ): Promise<TeacherClassroomGradebookResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const result = await this.gradesReadAdapter.getGradebook({
      allocation,
      filters: query,
    });

    return TeacherClassroomGradesPresenter.presentGradebook({
      classId: allocation.id,
      result,
    });
  }
}
