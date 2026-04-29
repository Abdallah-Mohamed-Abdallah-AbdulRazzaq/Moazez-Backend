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
  AwardHeroMissionBadgeUseCase,
  GetStudentHeroRewardsUseCase,
  GrantHeroMissionXpUseCase,
} from '../application/hero-journey-rewards.use-cases';
import {
  AwardHeroMissionBadgeDto,
  GetStudentHeroRewardsQueryDto,
  GrantHeroMissionXpDto,
} from '../dto/hero-journey-rewards.dto';

@ApiTags('reinforcement-hero-journey')
@ApiBearerAuth()
@Controller('reinforcement/hero')
export class HeroJourneyRewardsController {
  constructor(
    private readonly grantHeroMissionXpUseCase: GrantHeroMissionXpUseCase,
    private readonly awardHeroMissionBadgeUseCase: AwardHeroMissionBadgeUseCase,
    private readonly getStudentHeroRewardsUseCase: GetStudentHeroRewardsUseCase,
  ) {}

  @Post('progress/:progressId/grant-xp')
  @RequiredPermissions('reinforcement.hero.progress.manage')
  grantXp(
    @Param('progressId', new ParseUUIDPipe()) progressId: string,
    @Body() dto: GrantHeroMissionXpDto,
  ) {
    return this.grantHeroMissionXpUseCase.execute(progressId, dto ?? {});
  }

  @Post('progress/:progressId/award-badge')
  @RequiredPermissions('reinforcement.hero.progress.manage')
  awardBadge(
    @Param('progressId', new ParseUUIDPipe()) progressId: string,
    @Body() dto: AwardHeroMissionBadgeDto,
  ) {
    return this.awardHeroMissionBadgeUseCase.execute(progressId, dto ?? {});
  }

  @Get('students/:studentId/rewards')
  @RequiredPermissions('reinforcement.hero.progress.view')
  getStudentRewards(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: GetStudentHeroRewardsQueryDto,
  ) {
    return this.getStudentHeroRewardsUseCase.execute(studentId, query);
  }
}
