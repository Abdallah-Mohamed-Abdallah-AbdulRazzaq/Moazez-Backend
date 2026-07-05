import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { GetDismissalRequestDetailUseCase } from '../application/get-dismissal-request-detail.use-case';
import { ListActiveDismissalRequestsUseCase } from '../application/list-active-dismissal-requests.use-case';
import {
  ActiveDismissalRequestsListResponseDto,
  DismissalRequestDetailResponseDto,
  ListActiveDismissalRequestsQueryDto,
} from '../dto/dismissal-request-query.dto';

@ApiTags('dismissal-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/requests')
export class DismissalRequestsController {
  constructor(
    private readonly listActiveDismissalRequestsUseCase: ListActiveDismissalRequestsUseCase,
    private readonly getDismissalRequestDetailUseCase: GetDismissalRequestDetailUseCase,
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
}
