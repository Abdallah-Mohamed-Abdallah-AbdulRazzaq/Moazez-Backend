import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CheckUsernameAvailabilityUseCase } from './application/check-username-availability.use-case';
import { GetLoginIdentitySettingsUseCase } from './application/get-login-identity-settings.use-case';
import { PreviewLoginIdentityUseCase } from './application/preview-login-identity.use-case';
import { UpdateLoginIdentitySettingsUseCase } from './application/update-login-identity-settings.use-case';
import {
  LoginIdentityController,
  UsernameAvailabilityController,
} from './controller/login-identity.controller';
import { LoginIdentityRepository } from './infrastructure/login-identity.repository';

@Module({
  imports: [AuthModule],
  controllers: [LoginIdentityController, UsernameAvailabilityController],
  providers: [
    LoginIdentityRepository,
    GetLoginIdentitySettingsUseCase,
    UpdateLoginIdentitySettingsUseCase,
    PreviewLoginIdentityUseCase,
    CheckUsernameAvailabilityUseCase,
  ],
  exports: [LoginIdentityRepository],
})
export class LoginIdentityModule {}
