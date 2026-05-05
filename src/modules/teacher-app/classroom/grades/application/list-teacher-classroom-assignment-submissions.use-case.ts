import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../../shared/teacher-app.types';
import {
  ListTeacherClassroomAssignmentSubmissionsQueryDto,
  TeacherClassroomAssignmentSubmissionsListResponseDto,
} from '../dto/teacher-classroom-grades.dto';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomGradesPresenter } from '../presenters/teacher-classroom-grades.presenter';

@Injectable()
export class ListTeacherClassroomAssignmentSubmissionsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly gradesReadAdapter: TeacherClassroomGradesReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    assignmentId: string,
    query: ListTeacherClassroomAssignmentSubmissionsQueryDto,
  ): Promise<TeacherClassroomAssignmentSubmissionsListResponseDto> {
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const result = await this.gradesReadAdapter.listOwnedAssignmentSubmissions({
      allocation,
      assignmentId,
      filters: query,
    });

    return TeacherClassroomGradesPresenter.presentAssignmentSubmissions({
      classId: allocation.id,
      result,
    });
  }
}
