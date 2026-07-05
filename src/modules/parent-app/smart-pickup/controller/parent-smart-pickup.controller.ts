import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { CreateParentSmartPickupRequestUseCase } from '../application/create-parent-smart-pickup-request.use-case';
import { GetParentSmartPickupReadinessUseCase } from '../application/get-parent-smart-pickup-readiness.use-case';
import { ParentSmartPickupReadinessResponseDto } from '../dto/parent-smart-pickup.dto';
import {
  CreateParentSmartPickupRequestDto,
  CreateParentSmartPickupRequestResponseDto,
} from '../dto/parent-smart-pickup-request.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('parent/smart-pickup')
export class ParentSmartPickupController {
  constructor(
    private readonly getReadinessUseCase: GetParentSmartPickupReadinessUseCase,
    private readonly createRequestUseCase: CreateParentSmartPickupRequestUseCase,
  ) {}

  @Get()
  @RequiredPermissions('parent.smart_pickup.view')
  @ApiOkResponse({ type: ParentSmartPickupReadinessResponseDto })
  getReadiness(): Promise<ParentSmartPickupReadinessResponseDto> {
    return this.getReadinessUseCase.execute();
  }

  @Post('requests')
  @RequiredPermissions('parent.smart_pickup.request')
  @ApiCreatedResponse({ type: CreateParentSmartPickupRequestResponseDto })
  createRequest(
    @Body() body: CreateParentSmartPickupRequestDto,
  ): Promise<CreateParentSmartPickupRequestResponseDto> {
    return this.createRequestUseCase.execute(body);
  }
}
