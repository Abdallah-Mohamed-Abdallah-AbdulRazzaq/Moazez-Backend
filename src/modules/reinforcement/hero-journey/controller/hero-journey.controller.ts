import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  CreateHeroBadgeUseCase,
  DeleteHeroBadgeUseCase,
  GetHeroBadgeUseCase,
  ListHeroBadgesUseCase,
  UpdateHeroBadgeUseCase,
} from '../application/badge-catalog.use-cases';
import {
  ArchiveHeroMissionUseCase,
  CreateHeroMissionUseCase,
  DeleteHeroMissionUseCase,
  GetHeroMissionUseCase,
  ListHeroMissionsUseCase,
  PublishHeroMissionUseCase,
  UpdateHeroMissionUseCase,
} from '../application/hero-mission.use-cases';
import {
  ArchiveHeroMissionDto,
  CreateHeroBadgeDto,
  CreateHeroMissionDto,
  ListHeroBadgesQueryDto,
  ListHeroMissionsQueryDto,
  UpdateHeroBadgeDto,
  UpdateHeroMissionDto,
} from '../dto/hero-journey.dto';

@ApiTags('reinforcement-hero-journey')
@ApiBearerAuth()
@Controller('reinforcement/hero')
export class HeroJourneyController {
  constructor(
    private readonly listHeroBadgesUseCase: ListHeroBadgesUseCase,
    private readonly getHeroBadgeUseCase: GetHeroBadgeUseCase,
    private readonly createHeroBadgeUseCase: CreateHeroBadgeUseCase,
    private readonly updateHeroBadgeUseCase: UpdateHeroBadgeUseCase,
    private readonly deleteHeroBadgeUseCase: DeleteHeroBadgeUseCase,
    private readonly listHeroMissionsUseCase: ListHeroMissionsUseCase,
    private readonly getHeroMissionUseCase: GetHeroMissionUseCase,
    private readonly createHeroMissionUseCase: CreateHeroMissionUseCase,
    private readonly updateHeroMissionUseCase: UpdateHeroMissionUseCase,
    private readonly publishHeroMissionUseCase: PublishHeroMissionUseCase,
    private readonly archiveHeroMissionUseCase: ArchiveHeroMissionUseCase,
    private readonly deleteHeroMissionUseCase: DeleteHeroMissionUseCase,
  ) {}

  @Get('badges')
  @RequiredPermissions('reinforcement.hero.badges.view')
  listBadges(@Query() query: ListHeroBadgesQueryDto) {
    return this.listHeroBadgesUseCase.execute(query);
  }

  @Get('badges/:badgeId')
  @RequiredPermissions('reinforcement.hero.badges.view')
  getBadge(@Param('badgeId', new ParseUUIDPipe()) badgeId: string) {
    return this.getHeroBadgeUseCase.execute(badgeId);
  }

  @Post('badges')
  @RequiredPermissions('reinforcement.hero.badges.manage')
  createBadge(@Body() dto: CreateHeroBadgeDto) {
    return this.createHeroBadgeUseCase.execute(dto);
  }

  @Patch('badges/:badgeId')
  @RequiredPermissions('reinforcement.hero.badges.manage')
  updateBadge(
    @Param('badgeId', new ParseUUIDPipe()) badgeId: string,
    @Body() dto: UpdateHeroBadgeDto,
  ) {
    return this.updateHeroBadgeUseCase.execute(badgeId, dto);
  }

  @Delete('badges/:badgeId')
  @RequiredPermissions('reinforcement.hero.badges.manage')
  deleteBadge(@Param('badgeId', new ParseUUIDPipe()) badgeId: string) {
    return this.deleteHeroBadgeUseCase.execute(badgeId);
  }

  @Get('missions')
  @RequiredPermissions('reinforcement.hero.view')
  listMissions(@Query() query: ListHeroMissionsQueryDto) {
    return this.listHeroMissionsUseCase.execute(query);
  }

  @Get('missions/:missionId')
  @RequiredPermissions('reinforcement.hero.view')
  getMission(@Param('missionId', new ParseUUIDPipe()) missionId: string) {
    return this.getHeroMissionUseCase.execute(missionId);
  }

  @Post('missions')
  @RequiredPermissions('reinforcement.hero.manage')
  createMission(@Body() dto: CreateHeroMissionDto) {
    return this.createHeroMissionUseCase.execute(dto);
  }

  @Patch('missions/:missionId')
  @RequiredPermissions('reinforcement.hero.manage')
  updateMission(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() dto: UpdateHeroMissionDto,
  ) {
    return this.updateHeroMissionUseCase.execute(missionId, dto);
  }

  @Post('missions/:missionId/publish')
  @RequiredPermissions('reinforcement.hero.manage')
  publishMission(@Param('missionId', new ParseUUIDPipe()) missionId: string) {
    return this.publishHeroMissionUseCase.execute(missionId);
  }

  @Post('missions/:missionId/archive')
  @RequiredPermissions('reinforcement.hero.manage')
  archiveMission(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() dto: ArchiveHeroMissionDto,
  ) {
    return this.archiveHeroMissionUseCase.execute(missionId, dto ?? {});
  }

  @Delete('missions/:missionId')
  @RequiredPermissions('reinforcement.hero.manage')
  deleteMission(@Param('missionId', new ParseUUIDPipe()) missionId: string) {
    return this.deleteHeroMissionUseCase.execute(missionId);
  }
}
