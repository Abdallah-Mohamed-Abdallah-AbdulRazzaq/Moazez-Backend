import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetHeroBadgesSummaryUseCase,
  GetHeroClassroomSummaryUseCase,
  GetHeroMapUseCase,
  GetHeroOverviewUseCase,
  GetHeroStageSummaryUseCase,
} from '../application/hero-journey-dashboard.use-cases';
import {
  GetHeroBadgesSummaryQueryDto,
  GetHeroClassroomSummaryQueryDto,
  GetHeroMapQueryDto,
  GetHeroOverviewQueryDto,
  GetHeroStageSummaryQueryDto,
} from '../dto/hero-journey-dashboard.dto';

@ApiTags('reinforcement-hero-journey')
@ApiBearerAuth()
@Controller('reinforcement/hero')
export class HeroJourneyDashboardController {
  constructor(
    private readonly getHeroOverviewUseCase: GetHeroOverviewUseCase,
    private readonly getHeroMapUseCase: GetHeroMapUseCase,
    private readonly getHeroStageSummaryUseCase: GetHeroStageSummaryUseCase,
    private readonly getHeroClassroomSummaryUseCase: GetHeroClassroomSummaryUseCase,
    private readonly getHeroBadgesSummaryUseCase: GetHeroBadgesSummaryUseCase,
  ) {}

  @Get('overview')
  @RequiredPermissions('reinforcement.hero.view')
  getOverview(@Query() query: GetHeroOverviewQueryDto) {
    return this.getHeroOverviewUseCase.execute(query);
  }

  @Get('map')
  @RequiredPermissions('reinforcement.hero.view')
  getMap(@Query() query: GetHeroMapQueryDto) {
    return this.getHeroMapUseCase.execute(query);
  }

  @Get('stages/:stageId/summary')
  @RequiredPermissions('reinforcement.hero.view')
  getStageSummary(
    @Param('stageId', new ParseUUIDPipe()) stageId: string,
    @Query() query: GetHeroStageSummaryQueryDto,
  ) {
    return this.getHeroStageSummaryUseCase.execute(stageId, query);
  }

  @Get('classrooms/:classroomId/summary')
  @RequiredPermissions('reinforcement.hero.view')
  getClassroomSummary(
    @Param('classroomId', new ParseUUIDPipe()) classroomId: string,
    @Query() query: GetHeroClassroomSummaryQueryDto,
  ) {
    return this.getHeroClassroomSummaryUseCase.execute(classroomId, query);
  }

  @Get('badge-summary')
  @RequiredPermissions('reinforcement.hero.badges.view')
  getBadgeSummary(@Query() query: GetHeroBadgesSummaryQueryDto) {
    return this.getHeroBadgesSummaryUseCase.execute(query);
  }
}
