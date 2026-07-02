import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentChildHeroMissionUseCase } from '../application/get-parent-child-hero-mission.use-case';
import { GetParentChildHeroOverviewUseCase } from '../application/get-parent-child-hero-overview.use-case';
import { GetParentChildHeroProgressUseCase } from '../application/get-parent-child-hero-progress.use-case';
import { ListParentChildHeroBadgesUseCase } from '../application/list-parent-child-hero-badges.use-case';
import { ListParentChildHeroMissionsUseCase } from '../application/list-parent-child-hero-missions.use-case';
import {
  ParentHeroBadgesResponseDto,
  ParentHeroMissionDetailResponseDto,
  ParentHeroMissionsQueryDto,
  ParentHeroMissionsResponseDto,
  ParentHeroOverviewResponseDto,
  ParentHeroProgressResponseDto,
} from '../dto/parent-hero.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/hero')
export class ParentHeroController {
  constructor(
    private readonly getParentChildHeroOverviewUseCase: GetParentChildHeroOverviewUseCase,
    private readonly getParentChildHeroProgressUseCase: GetParentChildHeroProgressUseCase,
    private readonly listParentChildHeroBadgesUseCase: ListParentChildHeroBadgesUseCase,
    private readonly listParentChildHeroMissionsUseCase: ListParentChildHeroMissionsUseCase,
    private readonly getParentChildHeroMissionUseCase: GetParentChildHeroMissionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentHeroOverviewResponseDto })
  @RequiredPermissions(
    'reinforcement.hero.view',
    'reinforcement.hero.progress.view',
    'reinforcement.xp.view',
    'reinforcement.rewards.redemptions.view',
  )
  getHeroOverview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentHeroOverviewResponseDto> {
    return this.getParentChildHeroOverviewUseCase.execute(studentId);
  }

  @Get('progress')
  @ApiOkResponse({ type: ParentHeroProgressResponseDto })
  @RequiredPermissions('reinforcement.hero.progress.view')
  getHeroProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentHeroProgressResponseDto> {
    return this.getParentChildHeroProgressUseCase.execute(studentId);
  }

  @Get('badges')
  @ApiOkResponse({ type: ParentHeroBadgesResponseDto })
  @RequiredPermissions('reinforcement.hero.badges.view')
  listBadges(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentHeroBadgesResponseDto> {
    return this.listParentChildHeroBadgesUseCase.execute(studentId);
  }

  @Get('missions')
  @ApiOkResponse({ type: ParentHeroMissionsResponseDto })
  @RequiredPermissions(
    'reinforcement.hero.view',
    'reinforcement.hero.progress.view',
  )
  listMissions(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentHeroMissionsQueryDto,
  ): Promise<ParentHeroMissionsResponseDto> {
    return this.listParentChildHeroMissionsUseCase.execute(studentId, query);
  }

  @Get('missions/:missionId')
  @ApiOkResponse({ type: ParentHeroMissionDetailResponseDto })
  @RequiredPermissions(
    'reinforcement.hero.view',
    'reinforcement.hero.progress.view',
  )
  getMission(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
  ): Promise<ParentHeroMissionDetailResponseDto> {
    return this.getParentChildHeroMissionUseCase.execute(studentId, missionId);
  }
}
