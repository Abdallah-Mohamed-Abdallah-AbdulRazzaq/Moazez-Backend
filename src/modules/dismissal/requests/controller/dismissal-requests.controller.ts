import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { GetDismissalRequestDetailUseCase } from '../application/get-dismissal-request-detail.use-case';
import { ListActiveDismissalRequestsUseCase } from '../application/list-active-dismissal-requests.use-case';
import { UpdateDismissalRequestStatusUseCase } from '../application/update-dismissal-request-status.use-case';
import { DeliverDismissalRequestUseCase } from '../application/deliver-dismissal-request.use-case';
import {
  ActiveDismissalRequestsListResponseDto,
  DismissalRequestDetailResponseDto,
  ListActiveDismissalRequestsQueryDto,
} from '../dto/dismissal-request-query.dto';
import {
  DismissalRequestStatusUpdateResponseDto,
  UpdateDismissalRequestStatusDto,
} from '../dto/update-dismissal-request-status.dto';
import {
  DeliverDismissalRequestDto,
  DeliverDismissalRequestResponseDto,
} from '../dto/deliver-dismissal-request.dto';

@ApiTags('dismissal-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/requests')
export class DismissalRequestsController {
  constructor(
    private readonly listActiveDismissalRequestsUseCase: ListActiveDismissalRequestsUseCase,
    private readonly getDismissalRequestDetailUseCase: GetDismissalRequestDetailUseCase,
    private readonly updateDismissalRequestStatusUseCase: UpdateDismissalRequestStatusUseCase,
    private readonly deliverDismissalRequestUseCase: DeliverDismissalRequestUseCase,
  ) {}

  @Get('active')
  @RequiredPermissions('dismissal.requests.view')
  @ApiOkResponse({ type: ActiveDismissalRequestsListResponseDto })
  listActiveRequests(
    @Query() query: ListActiveDismissalRequestsQueryDto,
  ): Promise<ActiveDismissalRequestsListResponseDto> {
    return this.listActiveDismissalRequestsUseCase.execute(query);
  }

  @Get(':id')
  @RequiredPermissions('dismissal.requests.view')
  @ApiOkResponse({ type: DismissalRequestDetailResponseDto })
  getRequestDetail(
    @Param('id', new ParseUUIDPipe()) requestId: string,
  ): Promise<DismissalRequestDetailResponseDto> {
    return this.getDismissalRequestDetailUseCase.execute(requestId);
  }

  @Patch(':id/status')
  @RequiredPermissions('dismissal.requests.manage')
  @ApiOkResponse({ type: DismissalRequestStatusUpdateResponseDto })
  updateRequestStatus(
    @Param('id', new ParseUUIDPipe()) requestId: string,
    @Body() command: UpdateDismissalRequestStatusDto,
  ): Promise<DismissalRequestStatusUpdateResponseDto> {
    return this.updateDismissalRequestStatusUseCase.execute(requestId, command);
  }

  @Post(':id/deliver')
  @RequiredPermissions('dismissal.requests.deliver')
  @ApiOkResponse({ type: DeliverDismissalRequestResponseDto })
  deliverRequest(
    @Param('id', new ParseUUIDPipe()) requestId: string,
    @Body() command: DeliverDismissalRequestDto,
  ): Promise<DeliverDismissalRequestResponseDto> {
    return this.deliverDismissalRequestUseCase.execute(requestId, command);
  }
}
