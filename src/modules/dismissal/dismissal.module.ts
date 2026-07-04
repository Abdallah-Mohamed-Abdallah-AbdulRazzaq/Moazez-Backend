import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { CreateDismissalGateUseCase } from './gates/application/create-dismissal-gate.use-case';
import { GetDismissalGateUseCase } from './gates/application/get-dismissal-gate.use-case';
import { ListDismissalGatesUseCase } from './gates/application/list-dismissal-gates.use-case';
import { UpdateDismissalGateUseCase } from './gates/application/update-dismissal-gate.use-case';
import { DismissalGatesController } from './gates/controller/dismissal-gates.controller';
import { DismissalGatesRepository } from './gates/infrastructure/dismissal-gates.repository';
import { GetDismissalProfileUseCase } from './profile/application/get-dismissal-profile.use-case';
import { DismissalProfileController } from './profile/controller/dismissal-profile.controller';
import { GetDismissalSettingsUseCase } from './settings/application/get-dismissal-settings.use-case';
import { UpdateDismissalSettingsUseCase } from './settings/application/update-dismissal-settings.use-case';
import { DismissalSettingsController } from './settings/controller/dismissal-settings.controller';
import { DismissalSettingsRepository } from './settings/infrastructure/dismissal-settings.repository';
import { CreateDismissalStaffAssignmentUseCase } from './staff-assignments/application/create-dismissal-staff-assignment.use-case';
import { DeleteDismissalStaffAssignmentUseCase } from './staff-assignments/application/delete-dismissal-staff-assignment.use-case';
import { GetDismissalStaffAssignmentUseCase } from './staff-assignments/application/get-dismissal-staff-assignment.use-case';
import { ListDismissalStaffAssignmentsUseCase } from './staff-assignments/application/list-dismissal-staff-assignments.use-case';
import { UpdateDismissalStaffAssignmentUseCase } from './staff-assignments/application/update-dismissal-staff-assignment.use-case';
import { DismissalStaffAssignmentsController } from './staff-assignments/controller/dismissal-staff-assignments.controller';
import { DismissalStaffAssignmentsRepository } from './staff-assignments/infrastructure/dismissal-staff-assignments.repository';

@Module({
  imports: [IamModule],
  controllers: [
    DismissalSettingsController,
    DismissalGatesController,
    DismissalProfileController,
    DismissalStaffAssignmentsController,
  ],
  providers: [
    DismissalSettingsRepository,
    DismissalGatesRepository,
    DismissalStaffAssignmentsRepository,
    GetDismissalSettingsUseCase,
    UpdateDismissalSettingsUseCase,
    ListDismissalGatesUseCase,
    CreateDismissalGateUseCase,
    GetDismissalGateUseCase,
    UpdateDismissalGateUseCase,
    GetDismissalProfileUseCase,
    ListDismissalStaffAssignmentsUseCase,
    CreateDismissalStaffAssignmentUseCase,
    GetDismissalStaffAssignmentUseCase,
    UpdateDismissalStaffAssignmentUseCase,
    DeleteDismissalStaffAssignmentUseCase,
  ],
  exports: [
    DismissalSettingsRepository,
    DismissalGatesRepository,
    DismissalStaffAssignmentsRepository,
  ],
})
export class DismissalModule {}
