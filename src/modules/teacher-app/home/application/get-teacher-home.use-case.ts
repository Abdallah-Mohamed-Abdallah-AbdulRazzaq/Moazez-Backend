import { Injectable } from '@nestjs/common';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import { TeacherAppCompositionReadAdapter } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import { TeacherHomeResponseDto } from '../dto/teacher-home.dto';
import { TeacherHomePresenter } from '../presenters/teacher-home.presenter';

@Injectable()
export class GetTeacherHomeUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly compositionReadAdapter: TeacherAppCompositionReadAdapter,
  ) {}

  async execute(): Promise<TeacherHomeResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const [teacher, school, allocations] = await Promise.all([
      this.compositionReadAdapter.findTeacherIdentity(context.teacherUserId),
      this.compositionReadAdapter.findSchoolSummary(context),
      this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      ),
    ]);

    if (!teacher) {
      throw new TeacherAppRequiredTeacherException({
        reason: 'teacher_profile_not_found',
      });
    }

    const classroomIds = allocations.map((allocation) => allocation.classroomId);
    const [studentsCount, pendingTasksCount] = await Promise.all([
      this.compositionReadAdapter.countActiveStudentsAcrossClassrooms(
        classroomIds,
      ),
      this.compositionReadAdapter.countPendingTeacherTaskAssignments({
        teacherUserId: context.teacherUserId,
        classroomIds,
      }),
    ]);

    return TeacherHomePresenter.present({
      teacher,
      school,
      classesCount: allocations.length,
      studentsCount,
      pendingTasksCount,
      now: new Date(),
    });
  }
}
