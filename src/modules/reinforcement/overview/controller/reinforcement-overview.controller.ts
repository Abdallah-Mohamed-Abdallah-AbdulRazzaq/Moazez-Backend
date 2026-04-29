import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetClassroomReinforcementSummaryUseCase } from '../application/get-classroom-reinforcement-summary.use-case';
import { GetReinforcementOverviewUseCase } from '../application/get-reinforcement-overview.use-case';
import { GetStudentReinforcementProgressUseCase } from '../application/get-student-reinforcement-progress.use-case';
import {
  GetClassroomReinforcementSummaryQueryDto,
  GetReinforcementOverviewQueryDto,
  GetStudentReinforcementProgressQueryDto,
} from '../dto/reinforcement-overview.dto';

@ApiTags('reinforcement-overview')
@ApiBearerAuth()
@Controller('reinforcement')
export class ReinforcementOverviewController {
  constructor(
    private readonly getReinforcementOverviewUseCase: GetReinforcementOverviewUseCase,
    private readonly getStudentReinforcementProgressUseCase: GetStudentReinforcementProgressUseCase,
    private readonly getClassroomReinforcementSummaryUseCase: GetClassroomReinforcementSummaryUseCase,
  ) {}

  @Get('overview')
  @RequiredPermissions('reinforcement.overview.view')
  getOverview(
    @Query() query: GetReinforcementOverviewQueryDto,
  ) {
    return this.getReinforcementOverviewUseCase.execute(query);
  }

  @Get('students/:studentId/progress')
  @RequiredPermissions('reinforcement.overview.view')
  getStudentProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: GetStudentReinforcementProgressQueryDto,
  ) {
    return this.getStudentReinforcementProgressUseCase.execute(
      studentId,
      query,
    );
  }

  @Get('classrooms/:classroomId/summary')
  @RequiredPermissions('reinforcement.overview.view')
  getClassroomSummary(
    @Param('classroomId', new ParseUUIDPipe()) classroomId: string,
    @Query() query: GetClassroomReinforcementSummaryQueryDto,
  ) {
    return this.getClassroomReinforcementSummaryUseCase.execute(
      classroomId,
      query,
    );
  }
}
