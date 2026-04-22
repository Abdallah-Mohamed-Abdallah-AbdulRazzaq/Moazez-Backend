import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateLeadUseCase } from '../application/create-lead.use-case';
import { GetLeadUseCase } from '../application/get-lead.use-case';
import { ListLeadsUseCase } from '../application/list-leads.use-case';
import { UpdateLeadUseCase } from '../application/update-lead.use-case';
import {
  CreateLeadDto,
  LeadResponseDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from '../dto/lead.dto';

@ApiTags('admissions-leads')
@ApiBearerAuth()
@Controller('admissions/leads')
export class LeadsController {
  constructor(
    private readonly listLeadsUseCase: ListLeadsUseCase,
    private readonly createLeadUseCase: CreateLeadUseCase,
    private readonly getLeadUseCase: GetLeadUseCase,
    private readonly updateLeadUseCase: UpdateLeadUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: LeadResponseDto, isArray: true })
  @RequiredPermissions('admissions.leads.view')
  listLeads(@Query() query: ListLeadsQueryDto): Promise<LeadResponseDto[]> {
    return this.listLeadsUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: LeadResponseDto })
  @RequiredPermissions('admissions.leads.manage')
  createLead(@Body() dto: CreateLeadDto): Promise<LeadResponseDto> {
    return this.createLeadUseCase.execute(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: LeadResponseDto })
  @RequiredPermissions('admissions.leads.view')
  getLead(
    @Param('id', new ParseUUIDPipe()) leadId: string,
  ): Promise<LeadResponseDto> {
    return this.getLeadUseCase.execute(leadId);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LeadResponseDto })
  @RequiredPermissions('admissions.leads.manage')
  updateLead(
    @Param('id', new ParseUUIDPipe()) leadId: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<LeadResponseDto> {
    return this.updateLeadUseCase.execute(leadId, dto);
  }
}
