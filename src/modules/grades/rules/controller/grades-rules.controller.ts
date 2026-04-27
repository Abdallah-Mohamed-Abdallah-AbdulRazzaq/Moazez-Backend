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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetEffectiveGradeRuleUseCase } from '../application/get-effective-grade-rule.use-case';
import { ListGradeRulesUseCase } from '../application/list-grade-rules.use-case';
import { UpdateGradeRuleUseCase } from '../application/update-grade-rule.use-case';
import { UpsertGradeRuleUseCase } from '../application/upsert-grade-rule.use-case';
import { GetEffectiveGradeRuleQueryDto } from '../dto/get-effective-grade-rule-query.dto';
import { ListGradeRulesQueryDto } from '../dto/list-grade-rules-query.dto';
import {
  EffectiveGradeRuleResponseDto,
  GradeRulesListResponseDto,
  GradeRuleResponseDto,
} from '../dto/grade-rule-response.dto';
import { UpdateGradeRuleDto } from '../dto/update-grade-rule.dto';
import { UpsertGradeRuleDto } from '../dto/upsert-grade-rule.dto';

@ApiTags('grades-rules')
@ApiBearerAuth()
@Controller('grades/rules')
export class GradesRulesController {
  constructor(
    private readonly listGradeRulesUseCase: ListGradeRulesUseCase,
    private readonly getEffectiveGradeRuleUseCase: GetEffectiveGradeRuleUseCase,
    private readonly upsertGradeRuleUseCase: UpsertGradeRuleUseCase,
    private readonly updateGradeRuleUseCase: UpdateGradeRuleUseCase,
  ) {}

  @Get()
  @RequiredPermissions('grades.rules.view')
  listRules(
    @Query() query: ListGradeRulesQueryDto,
  ): Promise<GradeRulesListResponseDto> {
    return this.listGradeRulesUseCase.execute(query);
  }

  @Get('effective')
  @RequiredPermissions('grades.rules.view')
  getEffectiveRule(
    @Query() query: GetEffectiveGradeRuleQueryDto,
  ): Promise<EffectiveGradeRuleResponseDto> {
    return this.getEffectiveGradeRuleUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('grades.rules.manage')
  upsertRule(@Body() dto: UpsertGradeRuleDto): Promise<GradeRuleResponseDto> {
    return this.upsertGradeRuleUseCase.execute(dto);
  }

  @Patch(':ruleId')
  @RequiredPermissions('grades.rules.manage')
  updateRule(
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @Body() dto: UpdateGradeRuleDto,
  ): Promise<GradeRuleResponseDto> {
    return this.updateGradeRuleUseCase.execute(ruleId, dto);
  }
}
