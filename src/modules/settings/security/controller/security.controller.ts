import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetSecurityUseCase } from '../application/get-security.use-case';
import { UpdateSecurityUseCase } from '../application/update-security.use-case';
import { SecurityResponseDto } from '../dto/security-response.dto';
import { UpdateSecurityDto } from '../dto/update-security.dto';

@ApiTags('settings-security')
@ApiBearerAuth()
@Controller('settings/security')
export class SecurityController {
  constructor(
    private readonly getSecurityUseCase: GetSecurityUseCase,
    private readonly updateSecurityUseCase: UpdateSecurityUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.security.view')
  getSecurity(): Promise<SecurityResponseDto> {
    return this.getSecurityUseCase.execute();
  }

  @Patch()
  @RequiredPermissions('settings.security.manage')
  updateSecurity(@Body() dto: UpdateSecurityDto): Promise<SecurityResponseDto> {
    return this.updateSecurityUseCase.execute(dto);
  }
}
