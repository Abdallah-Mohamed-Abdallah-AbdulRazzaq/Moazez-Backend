import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CompleteStudentHeroMissionUseCase } from '../application/complete-student-hero-mission.use-case';
import { CompleteStudentHeroObjectiveUseCase } from '../application/complete-student-hero-objective.use-case';
import { GetStudentHeroMissionUseCase } from '../application/get-student-hero-mission.use-case';
import { GetStudentHeroOverviewUseCase } from '../application/get-student-hero-overview.use-case';
import { GetStudentHeroProgressUseCase } from '../application/get-student-hero-progress.use-case';
import { ListStudentHeroBadgesUseCase } from '../application/list-student-hero-badges.use-case';
import { ListStudentHeroMissionsUseCase } from '../application/list-student-hero-missions.use-case';
import { StartStudentHeroMissionUseCase } from '../application/start-student-hero-mission.use-case';
import {
  StudentHeroActionDto,
  StudentHeroBadgesResponseDto,
  StudentHeroMissionDetailResponseDto,
  StudentHeroMissionsQueryDto,
  StudentHeroMissionsResponseDto,
  StudentHeroOverviewResponseDto,
  StudentHeroProgressResponseDto,
} from '../dto/student-hero.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/hero')
export class StudentHeroController {
  constructor(
    private readonly getStudentHeroOverviewUseCase: GetStudentHeroOverviewUseCase,
    private readonly getStudentHeroProgressUseCase: GetStudentHeroProgressUseCase,
    private readonly listStudentHeroBadgesUseCase: ListStudentHeroBadgesUseCase,
    private readonly listStudentHeroMissionsUseCase: ListStudentHeroMissionsUseCase,
    private readonly getStudentHeroMissionUseCase: GetStudentHeroMissionUseCase,
    private readonly startStudentHeroMissionUseCase: StartStudentHeroMissionUseCase,
    private readonly completeStudentHeroMissionUseCase: CompleteStudentHeroMissionUseCase,
    private readonly completeStudentHeroObjectiveUseCase: CompleteStudentHeroObjectiveUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentHeroOverviewResponseDto })
  @RequiredPermissions('reinforcement.hero.view')
  getHeroOverview(): Promise<StudentHeroOverviewResponseDto> {
    return this.getStudentHeroOverviewUseCase.execute();
  }

  @Get('progress')
  @ApiOkResponse({ type: StudentHeroProgressResponseDto })
  @RequiredPermissions('reinforcement.hero.progress.view')
  getHeroProgress(): Promise<StudentHeroProgressResponseDto> {
    return this.getStudentHeroProgressUseCase.execute();
  }

  @Get('badges')
  @ApiOkResponse({ type: StudentHeroBadgesResponseDto })
  @RequiredPermissions('reinforcement.hero.badges.view')
  listBadges(): Promise<StudentHeroBadgesResponseDto> {
    return this.listStudentHeroBadgesUseCase.execute();
  }

  @Get('missions')
  @ApiOkResponse({ type: StudentHeroMissionsResponseDto })
  @RequiredPermissions('reinforcement.hero.view')
  listMissions(
    @Query() query: StudentHeroMissionsQueryDto,
  ): Promise<StudentHeroMissionsResponseDto> {
    return this.listStudentHeroMissionsUseCase.execute(query);
  }

  @Get('missions/:missionId')
  @ApiOkResponse({ type: StudentHeroMissionDetailResponseDto })
  @RequiredPermissions('reinforcement.hero.view')
  getMission(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
  ): Promise<StudentHeroMissionDetailResponseDto> {
    return this.getStudentHeroMissionUseCase.execute(missionId);
  }

  @Post('missions/:missionId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentHeroMissionDetailResponseDto })
  startMission(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() _dto: StudentHeroActionDto,
  ): Promise<StudentHeroMissionDetailResponseDto> {
    return this.startStudentHeroMissionUseCase.execute(missionId);
  }

  @Post('missions/:missionId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentHeroMissionDetailResponseDto })
  completeMission(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() _dto: StudentHeroActionDto,
  ): Promise<StudentHeroMissionDetailResponseDto> {
    return this.completeStudentHeroMissionUseCase.execute(missionId);
  }

  @Post('missions/:missionId/objectives/:objectiveId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentHeroMissionDetailResponseDto })
  completeObjective(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Param('objectiveId', new ParseUUIDPipe()) objectiveId: string,
    @Body() _dto: StudentHeroActionDto,
  ): Promise<StudentHeroMissionDetailResponseDto> {
    return this.completeStudentHeroObjectiveUseCase.execute({
      missionId,
      objectiveId,
    });
  }
}
