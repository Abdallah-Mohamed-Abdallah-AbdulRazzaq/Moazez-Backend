import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentHeroMissionUseCase } from '../application/get-student-hero-mission.use-case';
import { GetStudentHeroOverviewUseCase } from '../application/get-student-hero-overview.use-case';
import { GetStudentHeroProgressUseCase } from '../application/get-student-hero-progress.use-case';
import { ListStudentHeroBadgesUseCase } from '../application/list-student-hero-badges.use-case';
import { ListStudentHeroMissionsUseCase } from '../application/list-student-hero-missions.use-case';
import {
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
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentHeroOverviewResponseDto })
  getHeroOverview(): Promise<StudentHeroOverviewResponseDto> {
    return this.getStudentHeroOverviewUseCase.execute();
  }

  @Get('progress')
  @ApiOkResponse({ type: StudentHeroProgressResponseDto })
  getHeroProgress(): Promise<StudentHeroProgressResponseDto> {
    return this.getStudentHeroProgressUseCase.execute();
  }

  @Get('badges')
  @ApiOkResponse({ type: StudentHeroBadgesResponseDto })
  listBadges(): Promise<StudentHeroBadgesResponseDto> {
    return this.listStudentHeroBadgesUseCase.execute();
  }

  @Get('missions')
  @ApiOkResponse({ type: StudentHeroMissionsResponseDto })
  listMissions(
    @Query() query: StudentHeroMissionsQueryDto,
  ): Promise<StudentHeroMissionsResponseDto> {
    return this.listStudentHeroMissionsUseCase.execute(query);
  }

  @Get('missions/:missionId')
  @ApiOkResponse({ type: StudentHeroMissionDetailResponseDto })
  getMission(
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
  ): Promise<StudentHeroMissionDetailResponseDto> {
    return this.getStudentHeroMissionUseCase.execute(missionId);
  }
}
