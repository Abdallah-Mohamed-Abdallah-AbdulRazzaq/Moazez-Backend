import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Get school login identity settings',
    description:
      'Returns the school-scoped login domain and username policy used to generate login emails.',
  })
  @ApiOkResponse({ type: LoginIdentitySettingsResponseDto })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.view in the current school scope.',
  })
  getSettings(): Promise<LoginIdentitySettingsResponseDto> {
    return this.getSettingsUseCase.execute();
  }

  @Put()
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Update school login identity settings',
    description:
      'Configures the school-owned login email domain and username policy.',
  })
  @ApiOkResponse({ type: LoginIdentitySettingsResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  updateSettings(
    @Body() dto: UpdateLoginIdentitySettingsDto,
  ): Promise<LoginIdentitySettingsResponseDto> {
    return this.updateSettingsUseCase.execute(dto);
  }

  @Get('preview')
  @RequiredPermissions('settings.users.view')
  @ApiOperation({
    summary: 'Preview a generated login email',
    description:
      'Normalizes a username candidate and combines it with the current school login domain without creating a user.',
  })
  @ApiOkResponse({ type: LoginIdentityPreviewResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.view in the current school scope.',
  })
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
  @ApiOperation({
    summary: 'Check username availability',
    description:
      'Validates a username candidate and reports whether the generated login email can be assigned in the current school.',
  })
  @ApiOkResponse({ type: UsernameAvailabilityResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.view in the current school scope.',
  })
  available(
    @Query() query: UsernameAvailabilityQueryDto,
  ): Promise<UsernameAvailabilityResponseDto> {
    return this.checkAvailabilityUseCase.execute(query);
  }
}
