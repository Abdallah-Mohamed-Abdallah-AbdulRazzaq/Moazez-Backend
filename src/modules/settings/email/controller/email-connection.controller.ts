import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ActivateEmailConnectionUseCase } from '../application/activate-email-connection.use-case';
import { DisableEmailConnectionUseCase } from '../application/disable-email-connection.use-case';
import { GetEmailConnectionUseCase } from '../application/get-email-connection.use-case';
import { TestEmailConnectionUseCase } from '../application/test-email-connection.use-case';
import { UpdateEmailConnectionUseCase } from '../application/update-email-connection.use-case';
import {
  SchoolEmailConnectionResponseDto,
  TestEmailConnectionDto,
  TestEmailConnectionResponseDto,
  UpdateEmailConnectionDto,
} from '../dto/email-connection.dto';

@ApiTags('settings-email-connection')
@ApiBearerAuth()
@Controller('settings/email/connection')
export class EmailConnectionController {
  constructor(
    private readonly getEmailConnectionUseCase: GetEmailConnectionUseCase,
    private readonly updateEmailConnectionUseCase: UpdateEmailConnectionUseCase,
    private readonly testEmailConnectionUseCase: TestEmailConnectionUseCase,
    private readonly activateEmailConnectionUseCase: ActivateEmailConnectionUseCase,
    private readonly disableEmailConnectionUseCase: DisableEmailConnectionUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.email.connection.view')
  @ApiOperation({
    summary: 'Get school email provider connection',
    description:
      'Returns the current school email provider settings with encrypted secrets represented only by boolean flags.',
  })
  @ApiOkResponse({ type: SchoolEmailConnectionResponseDto })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.connection.view in the current school scope.',
  })
  getConnection(): Promise<SchoolEmailConnectionResponseDto> {
    return this.getEmailConnectionUseCase.execute();
  }

  @Put()
  @RequiredPermissions('settings.email.connection.manage')
  @ApiOperation({
    summary: 'Update school email provider connection',
    description:
      'Stores outbound email configuration for the current school. Provider secrets are encrypted and never returned.',
  })
  @ApiOkResponse({ type: SchoolEmailConnectionResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.connection.manage in the current school scope.',
  })
  updateConnection(
    @Body() dto: UpdateEmailConnectionDto,
  ): Promise<SchoolEmailConnectionResponseDto> {
    return this.updateEmailConnectionUseCase.execute(dto);
  }

  @Post('test')
  @RequiredPermissions('settings.email.connection.manage')
  @ApiOperation({
    summary: 'Validate the school email provider connection',
    description:
      'Runs the bounded test path for the configured provider and records verification metadata without sending bulk or credential email.',
  })
  @ApiCreatedResponse({ type: TestEmailConnectionResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({ description: 'settings.email.connection_missing' })
  @ApiUnprocessableEntityResponse({
    description: 'settings.email.connection_test_failed',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.connection.manage in the current school scope.',
  })
  testConnection(
    @Body() dto: TestEmailConnectionDto,
  ): Promise<TestEmailConnectionResponseDto> {
    return this.testEmailConnectionUseCase.execute(dto);
  }

  @Post('activate')
  @RequiredPermissions('settings.email.connection.manage')
  @ApiOperation({ summary: 'Activate a verified school email connection' })
  @ApiCreatedResponse({ type: SchoolEmailConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'settings.email.connection_missing' })
  @ApiConflictResponse({
    description: 'settings.email.connection_not_verified',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.connection.manage in the current school scope.',
  })
  activateConnection(): Promise<SchoolEmailConnectionResponseDto> {
    return this.activateEmailConnectionUseCase.execute();
  }

  @Post('disable')
  @RequiredPermissions('settings.email.connection.manage')
  @ApiOperation({ summary: 'Disable the school email connection' })
  @ApiCreatedResponse({ type: SchoolEmailConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'settings.email.connection_missing' })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.connection.manage in the current school scope.',
  })
  disableConnection(): Promise<SchoolEmailConnectionResponseDto> {
    return this.disableEmailConnectionUseCase.execute();
  }
}
