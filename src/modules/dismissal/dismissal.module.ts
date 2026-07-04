import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { CreateDismissalGateUseCase } from './gates/application/create-dismissal-gate.use-case';
import { GetDismissalGateUseCase } from './gates/application/get-dismissal-gate.use-case';
import { ListDismissalGatesUseCase } from './gates/application/list-dismissal-gates.use-case';
import { UpdateDismissalGateUseCase } from './gates/application/update-dismissal-gate.use-case';
import { DismissalGatesController } from './gates/controller/dismissal-gates.controller';
import { DismissalGatesRepository } from './gates/infrastructure/dismissal-gates.repository';
import { GetDismissalSettingsUseCase } from './settings/application/get-dismissal-settings.use-case';
import { UpdateDismissalSettingsUseCase } from './settings/application/update-dismissal-settings.use-case';
import { DismissalSettingsController } from './settings/controller/dismissal-settings.controller';
import { DismissalSettingsRepository } from './settings/infrastructure/dismissal-settings.repository';

@Module({
  imports: [IamModule],
  controllers: [DismissalSettingsController, DismissalGatesController],
  providers: [
    DismissalSettingsRepository,
    DismissalGatesRepository,
    GetDismissalSettingsUseCase,
    UpdateDismissalSettingsUseCase,
    ListDismissalGatesUseCase,
    CreateDismissalGateUseCase,
    GetDismissalGateUseCase,
    UpdateDismissalGateUseCase,
  ],
  exports: [DismissalSettingsRepository, DismissalGatesRepository],
})
export class DismissalModule {}
