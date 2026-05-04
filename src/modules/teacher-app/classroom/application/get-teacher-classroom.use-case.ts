import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../shared/teacher-app.types';
import { TeacherClassroomDetailResponseDto } from '../dto/teacher-classroom.dto';
import { TeacherClassroomReadAdapter } from '../infrastructure/teacher-classroom-read.adapter';
import { TeacherClassroomPresenter } from '../presenters/teacher-classroom.presenter';

@Injectable()
export class GetTeacherClassroomUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly classroomReadAdapter: TeacherClassroomReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
  ): Promise<TeacherClassroomDetailResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const studentsCount =
      await this.classroomReadAdapter.countActiveStudentsInClassroom(
        allocation.classroomId,
      );

    return TeacherClassroomPresenter.presentDetail({
      allocation,
      studentsCount,
    });
  }
}
