import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherTaskSelectorsUseCase } from '../application/get-teacher-task-selectors.use-case';
import { GetTeacherTaskUseCase } from '../application/get-teacher-task.use-case';
import { GetTeacherTasksDashboardUseCase } from '../application/get-teacher-tasks-dashboard.use-case';
import { ListTeacherTasksUseCase } from '../application/list-teacher-tasks.use-case';
import {
  ListTeacherTasksQueryDto,
  TeacherTaskDashboardResponseDto,
  TeacherTaskDetailResponseDto,
  TeacherTaskParamsDto,
  TeacherTaskSelectorsResponseDto,
  TeacherTasksListResponseDto,
} from '../dto/teacher-tasks.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/tasks')
export class TeacherTasksController {
  constructor(
    private readonly getTeacherTasksDashboardUseCase: GetTeacherTasksDashboardUseCase,
    private readonly listTeacherTasksUseCase: ListTeacherTasksUseCase,
    private readonly getTeacherTaskUseCase: GetTeacherTaskUseCase,
    private readonly getTeacherTaskSelectorsUseCase: GetTeacherTaskSelectorsUseCase,
  ) {}

  @Get('dashboard')
  @ApiOkResponse({ type: TeacherTaskDashboardResponseDto })
  getDashboard(): Promise<TeacherTaskDashboardResponseDto> {
    return this.getTeacherTasksDashboardUseCase.execute();
  }

  @Get()
  @ApiOkResponse({ type: TeacherTasksListResponseDto })
  listTasks(
    @Query() query: ListTeacherTasksQueryDto,
  ): Promise<TeacherTasksListResponseDto> {
    return this.listTeacherTasksUseCase.execute(query);
  }

  @Get('selectors')
  @ApiOkResponse({ type: TeacherTaskSelectorsResponseDto })
  getSelectors(): Promise<TeacherTaskSelectorsResponseDto> {
    return this.getTeacherTaskSelectorsUseCase.execute();
  }

  @Get(':taskId')
  @ApiOkResponse({ type: TeacherTaskDetailResponseDto })
  getTask(
    @Param() params: TeacherTaskParamsDto,
  ): Promise<TeacherTaskDetailResponseDto> {
    return this.getTeacherTaskUseCase.execute(params.taskId);
  }
}
