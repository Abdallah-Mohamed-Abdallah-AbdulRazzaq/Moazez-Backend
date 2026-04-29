import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  CompleteHeroMissionUseCase,
  CompleteHeroObjectiveUseCase,
  GetHeroProgressDetailUseCase,
  GetStudentHeroProgressUseCase,
  StartHeroMissionUseCase,
} from '../application/hero-journey-progress.use-cases';
import {
  CompleteHeroMissionDto,
  CompleteHeroObjectiveDto,
  GetStudentHeroProgressQueryDto,
  StartHeroMissionDto,
} from '../dto/hero-journey-progress.dto';

@ApiTags('reinforcement-hero-journey')
@ApiBearerAuth()
@Controller('reinforcement/hero')
export class HeroJourneyProgressController {
  constructor(
    private readonly getStudentHeroProgressUseCase: GetStudentHeroProgressUseCase,
    private readonly getHeroProgressDetailUseCase: GetHeroProgressDetailUseCase,
    private readonly startHeroMissionUseCase: StartHeroMissionUseCase,
    private readonly completeHeroObjectiveUseCase: CompleteHeroObjectiveUseCase,
    private readonly completeHeroMissionUseCase: CompleteHeroMissionUseCase,
  ) {}

  @Get('students/:studentId/progress')
  @RequiredPermissions('reinforcement.hero.progress.view')
  getStudentProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: GetStudentHeroProgressQueryDto,
  ) {
    return this.getStudentHeroProgressUseCase.execute(studentId, query);
  }

  @Get('progress/:progressId')
  @RequiredPermissions('reinforcement.hero.progress.view')
  getProgressDetail(
    @Param('progressId', new ParseUUIDPipe()) progressId: string,
  ) {
    return this.getHeroProgressDetailUseCase.execute(progressId);
  }

  @Post('students/:studentId/missions/:missionId/start')
  @RequiredPermissions('reinforcement.hero.progress.manage')
  startMission(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() dto: StartHeroMissionDto,
  ) {
    return this.startHeroMissionUseCase.execute(
      studentId,
      missionId,
      dto ?? {},
    );
  }

  @Post('progress/:progressId/objectives/:objectiveId/complete')
  @RequiredPermissions('reinforcement.hero.progress.manage')
  completeObjective(
    @Param('progressId', new ParseUUIDPipe()) progressId: string,
    @Param('objectiveId', new ParseUUIDPipe()) objectiveId: string,
    @Body() dto: CompleteHeroObjectiveDto,
  ) {
    return this.completeHeroObjectiveUseCase.execute(
      progressId,
      objectiveId,
      dto ?? {},
    );
  }

  @Post('progress/:progressId/complete')
  @RequiredPermissions('reinforcement.hero.progress.manage')
  completeMission(
    @Param('progressId', new ParseUUIDPipe()) progressId: string,
    @Body() dto: CompleteHeroMissionDto,
  ) {
    return this.completeHeroMissionUseCase.execute(progressId, dto ?? {});
  }
}
