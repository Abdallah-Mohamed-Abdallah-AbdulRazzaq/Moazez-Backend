import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  @RequiredPermissions('settings.security.view')
  getConnection(): Promise<SchoolEmailConnectionResponseDto> {
    return this.getEmailConnectionUseCase.execute();
  }

  @Put()
  @RequiredPermissions('settings.security.manage')
  updateConnection(
    @Body() dto: UpdateEmailConnectionDto,
  ): Promise<SchoolEmailConnectionResponseDto> {
    return this.updateEmailConnectionUseCase.execute(dto);
  }

  @Post('test')
  @RequiredPermissions('settings.security.manage')
  testConnection(
    @Body() dto: TestEmailConnectionDto,
  ): Promise<TestEmailConnectionResponseDto> {
    return this.testEmailConnectionUseCase.execute(dto);
  }

  @Post('activate')
  @RequiredPermissions('settings.security.manage')
  activateConnection(): Promise<SchoolEmailConnectionResponseDto> {
    return this.activateEmailConnectionUseCase.execute();
  }

  @Post('disable')
  @RequiredPermissions('settings.security.manage')
  disableConnection(): Promise<SchoolEmailConnectionResponseDto> {
    return this.disableEmailConnectionUseCase.execute();
  }
}
