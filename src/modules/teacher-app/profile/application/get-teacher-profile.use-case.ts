import { Injectable } from '@nestjs/common';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import { TeacherProfileResponseDto } from '../dto/teacher-profile.dto';
import { TeacherProfileReadAdapter } from '../infrastructure/teacher-profile-read.adapter';
import { TeacherProfilePresenter } from '../presenters/teacher-profile.presenter';

@Injectable()
export class GetTeacherProfileUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly profileReadAdapter: TeacherProfileReadAdapter,
  ) {}

  async execute(): Promise<TeacherProfileResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const [teacher, school, role, allocations] = await Promise.all([
      this.profileReadAdapter.findTeacherIdentity(context.teacherUserId),
      this.profileReadAdapter.findSchoolDisplay(context),
      this.profileReadAdapter.findTeacherRole(context),
      this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      ),
    ]);

    if (!teacher) {
      throw new TeacherAppRequiredTeacherException({
        reason: 'teacher_profile_not_found',
      });
    }

    const studentsCount =
      await this.profileReadAdapter.countDistinctStudentsForAllocations(
        allocations,
      );

    return TeacherProfilePresenter.presentProfile({
      teacher,
      school,
      role,
      fallbackRoleId: context.roleId,
      classesSummary: {
        classesCount: allocations.length,
        subjectsCount: new Set(
          allocations.map((allocation) => allocation.subjectId),
        ).size,
        studentsCount,
      },
      permissions: context.permissions,
    });
  }
}
