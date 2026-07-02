import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentChildTaskSubmissionUseCase } from '../application/get-parent-child-task-submission.use-case';
import { GetParentChildTaskUseCase } from '../application/get-parent-child-task.use-case';
import { GetParentChildTasksSummaryUseCase } from '../application/get-parent-child-tasks-summary.use-case';
import { ListParentChildTaskSubmissionsUseCase } from '../application/list-parent-child-task-submissions.use-case';
import { ListParentChildTasksUseCase } from '../application/list-parent-child-tasks.use-case';
import {
  ParentTaskResponseDto,
  ParentTasksListResponseDto,
  ParentTasksQueryDto,
  ParentTasksSummaryResponseDto,
  ParentTaskSubmissionResponseDto,
  ParentTaskSubmissionsResponseDto,
} from '../dto/parent-tasks.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/tasks')
export class ParentTasksController {
  constructor(
    private readonly listParentChildTasksUseCase: ListParentChildTasksUseCase,
    private readonly getParentChildTasksSummaryUseCase: GetParentChildTasksSummaryUseCase,
    private readonly getParentChildTaskUseCase: GetParentChildTaskUseCase,
    private readonly listParentChildTaskSubmissionsUseCase: ListParentChildTaskSubmissionsUseCase,
    private readonly getParentChildTaskSubmissionUseCase: GetParentChildTaskSubmissionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentTasksListResponseDto })
  @RequiredPermissions('reinforcement.tasks.view')
  listTasks(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentTasksQueryDto,
  ): Promise<ParentTasksListResponseDto> {
    return this.listParentChildTasksUseCase.execute(studentId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: ParentTasksSummaryResponseDto })
  @RequiredPermissions('reinforcement.tasks.view')
  getSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentTasksSummaryResponseDto> {
    return this.getParentChildTasksSummaryUseCase.execute(studentId);
  }

  @Get(':taskId')
  @ApiOkResponse({ type: ParentTaskResponseDto })
  @RequiredPermissions(
    'reinforcement.tasks.view',
    'reinforcement.submissions.view',
  )
  getTask(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ): Promise<ParentTaskResponseDto> {
    return this.getParentChildTaskUseCase.execute(studentId, taskId);
  }

  @Get(':taskId/submissions')
  @ApiOkResponse({ type: ParentTaskSubmissionsResponseDto })
  @RequiredPermissions('reinforcement.submissions.view')
  listSubmissions(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ): Promise<ParentTaskSubmissionsResponseDto> {
    return this.listParentChildTaskSubmissionsUseCase.execute(
      studentId,
      taskId,
    );
  }

  @Get(':taskId/submissions/:submissionId')
  @ApiOkResponse({ type: ParentTaskSubmissionResponseDto })
  @RequiredPermissions('reinforcement.submissions.view')
  getSubmission(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<ParentTaskSubmissionResponseDto> {
    return this.getParentChildTaskSubmissionUseCase.execute({
      studentId,
      taskId,
      submissionId,
    });
  }
}
