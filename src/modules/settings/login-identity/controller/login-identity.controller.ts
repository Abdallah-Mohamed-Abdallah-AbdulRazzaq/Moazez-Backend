import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CheckUsernameAvailabilityUseCase } from '../application/check-username-availability.use-case';
import { GetLoginIdentitySettingsUseCase } from '../application/get-login-identity-settings.use-case';
import { PreviewLoginIdentityUseCase } from '../application/preview-login-identity.use-case';
import { UpdateLoginIdentitySettingsUseCase } from '../application/update-login-identity-settings.use-case';
import {
  LoginIdentityPreviewQueryDto,
  LoginIdentityPreviewResponseDto,
  LoginIdentitySettingsResponseDto,
  UpdateLoginIdentitySettingsDto,
  UsernameAvailabilityQueryDto,
  UsernameAvailabilityResponseDto,
} from '../dto/login-identity.dto';

@ApiTags('settings-login-identity')
@ApiBearerAuth()
@Controller('settings/login-identity')
export class LoginIdentityController {
  constructor(
    private readonly getSettingsUseCase: GetLoginIdentitySettingsUseCase,
    private readonly updateSettingsUseCase: UpdateLoginIdentitySettingsUseCase,
    private readonly previewUseCase: PreviewLoginIdentityUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.users.view')
  getSettings(): Promise<LoginIdentitySettingsResponseDto> {
    return this.getSettingsUseCase.execute();
  }

  @Put()
  @RequiredPermissions('settings.users.manage')
  updateSettings(
    @Body() dto: UpdateLoginIdentitySettingsDto,
  ): Promise<LoginIdentitySettingsResponseDto> {
    return this.updateSettingsUseCase.execute(dto);
  }

  @Get('preview')
  @RequiredPermissions('settings.users.view')
  preview(
    @Query() query: LoginIdentityPreviewQueryDto,
  ): Promise<LoginIdentityPreviewResponseDto> {
    return this.previewUseCase.execute(query);
  }
}

@ApiTags('settings-users')
@ApiBearerAuth()
@Controller('settings/users/usernames')
export class UsernameAvailabilityController {
  constructor(
    private readonly checkAvailabilityUseCase: CheckUsernameAvailabilityUseCase,
  ) {}

  @Get('available')
  @RequiredPermissions('settings.users.view')
  available(
    @Query() query: UsernameAvailabilityQueryDto,
  ): Promise<UsernameAvailabilityResponseDto> {
    return this.checkAvailabilityUseCase.execute(query);
  }
}
