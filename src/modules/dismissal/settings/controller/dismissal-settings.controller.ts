import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { GetDismissalSettingsUseCase } from '../application/get-dismissal-settings.use-case';
import { UpdateDismissalSettingsUseCase } from '../application/update-dismissal-settings.use-case';
import {
  DismissalSettingsResponseDto,
  UpdateDismissalSettingsDto,
} from '../dto/dismissal-settings.dto';

@ApiTags('dismissal-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/settings')
export class DismissalSettingsController {
  constructor(
    private readonly getDismissalSettingsUseCase: GetDismissalSettingsUseCase,
    private readonly updateDismissalSettingsUseCase: UpdateDismissalSettingsUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.settings.view')
  @ApiOkResponse({ type: DismissalSettingsResponseDto })
  getSettings(): Promise<DismissalSettingsResponseDto> {
    return this.getDismissalSettingsUseCase.execute();
  }

  @Patch()
  @RequiredPermissions('dismissal.settings.manage')
  @ApiOkResponse({ type: DismissalSettingsResponseDto })
  updateSettings(
    @Body() dto: UpdateDismissalSettingsDto,
  ): Promise<DismissalSettingsResponseDto> {
    return this.updateDismissalSettingsUseCase.execute(dto);
  }
}
