import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateReinforcementTaskTemplateUseCase } from '../application/create-reinforcement-task-template.use-case';
import { ListReinforcementTemplatesUseCase } from '../application/list-reinforcement-templates.use-case';
import {
  CreateReinforcementTaskTemplateDto,
  ListReinforcementTemplatesQueryDto,
} from '../dto/reinforcement-template.dto';

@ApiTags('reinforcement-templates')
@ApiBearerAuth()
@Controller('reinforcement/templates')
export class ReinforcementTemplatesController {
  constructor(
    private readonly listReinforcementTemplatesUseCase: ListReinforcementTemplatesUseCase,
    private readonly createReinforcementTaskTemplateUseCase: CreateReinforcementTaskTemplateUseCase,
  ) {}

  @Get()
  @RequiredPermissions('reinforcement.templates.view')
  listTemplates(@Query() query: ListReinforcementTemplatesQueryDto) {
    return this.listReinforcementTemplatesUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('reinforcement.templates.manage')
  createTemplate(@Body() dto: CreateReinforcementTaskTemplateDto) {
    return this.createReinforcementTaskTemplateUseCase.execute(dto);
  }
}
