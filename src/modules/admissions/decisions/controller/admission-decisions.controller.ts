import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateAdmissionDecisionUseCase } from '../application/create-admission-decision.use-case';
import { GetAdmissionDecisionUseCase } from '../application/get-admission-decision.use-case';
import { ListAdmissionDecisionsUseCase } from '../application/list-admission-decisions.use-case';
import {
  AdmissionDecisionResponseDto,
  AdmissionDecisionsListResponseDto,
  CreateAdmissionDecisionDto,
  ListAdmissionDecisionsQueryDto,
} from '../dto/admission-decision.dto';

@ApiTags('admissions-decisions')
@ApiBearerAuth()
@Controller('admissions/decisions')
export class AdmissionDecisionsController {
  constructor(
    private readonly listAdmissionDecisionsUseCase: ListAdmissionDecisionsUseCase,
    private readonly createAdmissionDecisionUseCase: CreateAdmissionDecisionUseCase,
    private readonly getAdmissionDecisionUseCase: GetAdmissionDecisionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: AdmissionDecisionsListResponseDto })
  @RequiredPermissions('admissions.decisions.view')
  listAdmissionDecisions(
    @Query() query: ListAdmissionDecisionsQueryDto,
  ): Promise<AdmissionDecisionsListResponseDto> {
    return this.listAdmissionDecisionsUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdmissionDecisionResponseDto })
  @RequiredPermissions('admissions.decisions.manage')
  createAdmissionDecision(
    @Body() dto: CreateAdmissionDecisionDto,
  ): Promise<AdmissionDecisionResponseDto> {
    return this.createAdmissionDecisionUseCase.execute(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdmissionDecisionResponseDto })
  @RequiredPermissions('admissions.decisions.view')
  getAdmissionDecision(
    @Param('id', new ParseUUIDPipe()) admissionDecisionId: string,
  ): Promise<AdmissionDecisionResponseDto> {
    return this.getAdmissionDecisionUseCase.execute(admissionDecisionId);
  }
}
