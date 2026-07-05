import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CancelParentSmartPickupRequestUseCase } from '../application/cancel-parent-smart-pickup-request.use-case';
import { GetParentSmartPickupReadinessUseCase } from '../application/get-parent-smart-pickup-readiness.use-case';
import { ListParentSmartPickupRecentCallsUseCase } from '../application/list-parent-smart-pickup-recent-calls.use-case';
import { ParentSmartPickupReadinessResponseDto } from '../dto/parent-smart-pickup.dto';
import {
  CancelParentSmartPickupRequestDto,
  CancelParentSmartPickupRequestResponseDto,
} from '../dto/cancel-parent-smart-pickup-request.dto';
import {
  ParentSmartPickupRecentCallsQueryDto,
  ParentSmartPickupRecentCallsResponseDto,
} from '../dto/parent-smart-pickup-recent-calls.dto';
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
    private readonly listRecentCallsUseCase: ListParentSmartPickupRecentCallsUseCase,
    private readonly cancelRequestUseCase: CancelParentSmartPickupRequestUseCase,
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

  @Get('recent-calls')
  @RequiredPermissions('parent.smart_pickup.view')
  @ApiOkResponse({ type: ParentSmartPickupRecentCallsResponseDto })
  listRecentCalls(
    @Query() query: ParentSmartPickupRecentCallsQueryDto,
  ): Promise<ParentSmartPickupRecentCallsResponseDto> {
    return this.listRecentCallsUseCase.execute(query);
  }

  @Post('requests/:id/cancel')
  @RequiredPermissions('parent.smart_pickup.cancel')
  @ApiOkResponse({ type: CancelParentSmartPickupRequestResponseDto })
  cancelRequest(
    @Param('id', new ParseUUIDPipe()) requestId: string,
    @Body() body: CancelParentSmartPickupRequestDto,
  ): Promise<CancelParentSmartPickupRequestResponseDto> {
    return this.cancelRequestUseCase.execute(requestId, body);
  }
}
