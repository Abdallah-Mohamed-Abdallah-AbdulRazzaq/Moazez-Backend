import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetGradesBootstrapUseCase } from '../application/get-grades-bootstrap.use-case';
import { GetGradesOverviewUseCase } from '../application/get-grades-overview.use-case';
import {
  GetGradesBootstrapQueryDto,
  GradesBootstrapResponseDto,
} from '../dto/grades-bootstrap.dto';
import {
  GetGradesOverviewQueryDto,
  GradesOverviewResponseDto,
} from '../dto/grades-overview.dto';

@ApiTags('grades-dashboard')
@ApiBearerAuth()
@Controller('grades')
export class GradesDashboardController {
  constructor(
    private readonly getGradesBootstrapUseCase: GetGradesBootstrapUseCase,
    private readonly getGradesOverviewUseCase: GetGradesOverviewUseCase,
  ) {}

  @Get('bootstrap')
  @RequiredPermissions('grades.gradebook.view')
  getBootstrap(
    @Query() query: GetGradesBootstrapQueryDto,
  ): Promise<GradesBootstrapResponseDto> {
    return this.getGradesBootstrapUseCase.execute(query);
  }

  @Get('overview')
  @RequiredPermissions('grades.analytics.view')
  getOverview(
    @Query() query: GetGradesOverviewQueryDto,
  ): Promise<GradesOverviewResponseDto> {
    return this.getGradesOverviewUseCase.execute(query);
  }
}
