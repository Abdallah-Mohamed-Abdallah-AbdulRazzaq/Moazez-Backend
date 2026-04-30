import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  GetBehaviorOverviewUseCase,
  GetClassroomBehaviorSummaryUseCase,
  GetStudentBehaviorSummaryUseCase,
} from '../application/behavior-dashboard.use-cases';
import {
  GetBehaviorOverviewQueryDto,
  GetClassroomBehaviorSummaryQueryDto,
  GetStudentBehaviorSummaryQueryDto,
} from '../dto/behavior-dashboard.dto';

@ApiTags('behavior')
@ApiBearerAuth()
@Controller('behavior')
export class BehaviorDashboardController {
  constructor(
    private readonly getBehaviorOverviewUseCase: GetBehaviorOverviewUseCase,
    private readonly getStudentBehaviorSummaryUseCase: GetStudentBehaviorSummaryUseCase,
    private readonly getClassroomBehaviorSummaryUseCase: GetClassroomBehaviorSummaryUseCase,
  ) {}

  @Get('overview')
  @RequiredPermissions('behavior.overview.view')
  getOverview(@Query() query: GetBehaviorOverviewQueryDto) {
    return this.getBehaviorOverviewUseCase.execute(query);
  }

  @Get('students/:studentId/summary')
  @RequiredPermissions('behavior.records.view')
  getStudentSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: GetStudentBehaviorSummaryQueryDto,
  ) {
    return this.getStudentBehaviorSummaryUseCase.execute(studentId, query);
  }

  @Get('classrooms/:classroomId/summary')
  @RequiredPermissions('behavior.overview.view')
  getClassroomSummary(
    @Param('classroomId', new ParseUUIDPipe()) classroomId: string,
    @Query() query: GetClassroomBehaviorSummaryQueryDto,
  ) {
    return this.getClassroomBehaviorSummaryUseCase.execute(classroomId, query);
  }
}
