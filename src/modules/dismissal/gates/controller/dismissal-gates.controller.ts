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
import { CreateDismissalGateUseCase } from '../application/create-dismissal-gate.use-case';
import { GetDismissalGateUseCase } from '../application/get-dismissal-gate.use-case';
import { ListDismissalGatesUseCase } from '../application/list-dismissal-gates.use-case';
import { UpdateDismissalGateUseCase } from '../application/update-dismissal-gate.use-case';
import {
  CreateDismissalGateDto,
  DismissalGateResponseDto,
  DismissalGatesListResponseDto,
  ListDismissalGatesQueryDto,
  UpdateDismissalGateDto,
} from '../dto/dismissal-gate.dto';

@ApiTags('dismissal-gates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/gates')
export class DismissalGatesController {
  constructor(
    private readonly listDismissalGatesUseCase: ListDismissalGatesUseCase,
    private readonly createDismissalGateUseCase: CreateDismissalGateUseCase,
    private readonly getDismissalGateUseCase: GetDismissalGateUseCase,
    private readonly updateDismissalGateUseCase: UpdateDismissalGateUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.gates.view')
  @ApiOkResponse({ type: DismissalGatesListResponseDto })
  listGates(
    @Query() query: ListDismissalGatesQueryDto,
  ): Promise<DismissalGatesListResponseDto> {
    return this.listDismissalGatesUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('dismissal.gates.manage')
  @ApiCreatedResponse({ type: DismissalGateResponseDto })
  createGate(
    @Body() dto: CreateDismissalGateDto,
  ): Promise<DismissalGateResponseDto> {
    return this.createDismissalGateUseCase.execute(dto);
  }

  @Get(':id')
  @RequiredPermissions('dismissal.gates.view')
  @ApiOkResponse({ type: DismissalGateResponseDto })
  getGate(
    @Param('id', new ParseUUIDPipe()) gateId: string,
  ): Promise<DismissalGateResponseDto> {
    return this.getDismissalGateUseCase.execute(gateId);
  }

  @Patch(':id')
  @RequiredPermissions('dismissal.gates.manage')
  @ApiOkResponse({ type: DismissalGateResponseDto })
  updateGate(
    @Param('id', new ParseUUIDPipe()) gateId: string,
    @Body() dto: UpdateDismissalGateDto,
  ): Promise<DismissalGateResponseDto> {
    return this.updateDismissalGateUseCase.execute(gateId, dto);
  }
}
