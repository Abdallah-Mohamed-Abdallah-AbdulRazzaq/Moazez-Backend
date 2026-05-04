import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  ListTeacherClassroomAssignmentsQueryDto,
  TeacherClassroomAssignmentsListResponseDto,
} from '../dto/teacher-classroom-grades.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomGradesPresenter } from '../presenters/teacher-classroom-grades.presenter';

@Injectable()
export class ListTeacherClassroomAssignmentsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    query: ListTeacherClassroomAssignmentsQueryDto,
  ): Promise<TeacherClassroomAssignmentsListResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const result = await this.gradesReadAdapter.listAssignments({
      allocation,
      filters: query,
    });

    return TeacherClassroomGradesPresenter.presentAssignments({
      classId: allocation.id,
      result,
    });
  }
}
