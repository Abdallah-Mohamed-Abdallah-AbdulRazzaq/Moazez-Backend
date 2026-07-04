import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { GetParentSmartPickupReadinessUseCase } from '../application/get-parent-smart-pickup-readiness.use-case';
import { ParentSmartPickupReadinessResponseDto } from '../dto/parent-smart-pickup.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('parent/smart-pickup')
export class ParentSmartPickupController {
  constructor(
    private readonly getReadinessUseCase: GetParentSmartPickupReadinessUseCase,
  ) {}

  @Get()
  @RequiredPermissions('parent.smart_pickup.view')
  @ApiOkResponse({ type: ParentSmartPickupReadinessResponseDto })
  getReadiness(): Promise<ParentSmartPickupReadinessResponseDto> {
    return this.getReadinessUseCase.execute();
  }
}
