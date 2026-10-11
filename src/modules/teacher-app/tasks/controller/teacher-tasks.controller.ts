import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { GetTeacherOwnedTaskProofContentUseCase } from '../application/get-teacher-owned-task-proof-content.use-case';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateTeacherTaskUseCase } from '../application/create-teacher-task.use-case';
import { GetTeacherTaskSelectorsUseCase } from '../application/get-teacher-task-selectors.use-case';
import { GetTeacherTaskUseCase } from '../application/get-teacher-task.use-case';
import { GetTeacherTasksDashboardUseCase } from '../application/get-teacher-tasks-dashboard.use-case';
import { ListTeacherTasksUseCase } from '../application/list-teacher-tasks.use-case';
import {
  ListTeacherTasksQueryDto,
  TeacherTaskCreateDto,
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
    private readonly proofContent: GetTeacherOwnedTaskProofContentUseCase,
    private readonly getTeacherTasksDashboardUseCase: GetTeacherTasksDashboardUseCase,
    private readonly listTeacherTasksUseCase: ListTeacherTasksUseCase,
    private readonly getTeacherTaskUseCase: GetTeacherTaskUseCase,
    private readonly getTeacherTaskSelectorsUseCase: GetTeacherTaskSelectorsUseCase,
    private readonly createTeacherTaskUseCase: CreateTeacherTaskUseCase,
  ) {}

  @Get('dashboard')
  @RequiredPermissions('reinforcement.tasks.view')
  @ApiOkResponse({ type: TeacherTaskDashboardResponseDto })
  getDashboard(): Promise<TeacherTaskDashboardResponseDto> {
    return this.getTeacherTasksDashboardUseCase.execute();
  }

  @Get()
  @RequiredPermissions('reinforcement.tasks.view')
  @ApiOkResponse({ type: TeacherTasksListResponseDto })
  listTasks(
    @Query() query: ListTeacherTasksQueryDto,
  ): Promise<TeacherTasksListResponseDto> {
    return this.listTeacherTasksUseCase.execute(query);
  }

  @Get('selectors')
  @RequiredPermissions('reinforcement.tasks.view')
  @ApiOkResponse({ type: TeacherTaskSelectorsResponseDto })
  getSelectors(): Promise<TeacherTaskSelectorsResponseDto> {
    return this.getTeacherTaskSelectorsUseCase.execute();
  }

  @Post()
  @RequiredPermissions('reinforcement.tasks.manage')
  @ApiCreatedResponse({ type: TeacherTaskDetailResponseDto })
  createTask(
    @Body() dto: TeacherTaskCreateDto,
  ): Promise<TeacherTaskDetailResponseDto> {
    return this.createTeacherTaskUseCase.execute(dto);
  }

  @Get(':taskId')
  @RequiredPermissions('reinforcement.tasks.view')
  @ApiOkResponse({ type: TeacherTaskDetailResponseDto })
  getTask(
    @Param() params: TeacherTaskParamsDto,
  ): Promise<TeacherTaskDetailResponseDto> {
    return this.getTeacherTaskUseCase.execute(params.taskId);
  }

  @Get(':taskId/submissions/:submissionId/files/:fileId/download/content')
  @RequiredPermissions('reinforcement.tasks.view')
  async proofFileContent(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.proofContent.execute(
      taskId,
      submissionId,
      fileId,
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
