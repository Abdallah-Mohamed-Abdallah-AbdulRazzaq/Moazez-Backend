import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { GetDismissalProfileUseCase } from '../application/get-dismissal-profile.use-case';
import { DismissalProfileResponseDto } from '../dto/dismissal-profile.dto';

@ApiTags('dismissal-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/profile')
export class DismissalProfileController {
  constructor(
    private readonly getDismissalProfileUseCase: GetDismissalProfileUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.profile.view')
  @ApiOkResponse({ type: DismissalProfileResponseDto })
  getProfile(): Promise<DismissalProfileResponseDto> {
    return this.getDismissalProfileUseCase.execute();
  }
}
