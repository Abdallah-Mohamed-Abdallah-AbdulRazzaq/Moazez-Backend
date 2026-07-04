import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { requireDismissalScope } from '../../shared/dismissal-context';
import { DismissalProfileInvalidActorTypeException } from '../../shared/dismissal.errors';
import { DismissalStaffAssignmentsRepository } from '../../staff-assignments/infrastructure/dismissal-staff-assignments.repository';
import { DismissalProfileResponseDto } from '../dto/dismissal-profile.dto';
import { presentDismissalProfile } from '../presenter/dismissal-profile.presenter';

@Injectable()
export class GetDismissalProfileUseCase {
  constructor(
    private readonly dismissalStaffAssignmentsRepository: DismissalStaffAssignmentsRepository,
  ) {}

  async execute(): Promise<DismissalProfileResponseDto> {
    const dismissalScope = requireDismissalScope();
    if (dismissalScope.userType !== UserType.DISMISSAL_STAFF) {
      throw new DismissalProfileInvalidActorTypeException();
    }

    const [user, school, assignments] = await Promise.all([
      this.dismissalStaffAssignmentsRepository.findProfileUser(
        dismissalScope.actorId,
      ),
      this.dismissalStaffAssignmentsRepository.findProfileSchool(
        dismissalScope.schoolId,
      ),
      this.dismissalStaffAssignmentsRepository.listActiveAssignmentsForStaff(
        dismissalScope.actorId,
      ),
    ]);

    if (!user || user.userType !== UserType.DISMISSAL_STAFF) {
      throw new DismissalProfileInvalidActorTypeException();
    }

    return presentDismissalProfile({
      user,
      school,
      assignments,
      permissions: dismissalScope.permissions,
    });
  }
}
