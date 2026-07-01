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
import { GetStudentTaskSubmissionUseCase } from '../application/get-student-task-submission.use-case';
import { GetStudentTaskUseCase } from '../application/get-student-task.use-case';
import { GetStudentTasksSummaryUseCase } from '../application/get-student-tasks-summary.use-case';
import { ListStudentTaskSubmissionsUseCase } from '../application/list-student-task-submissions.use-case';
import { ListStudentTasksUseCase } from '../application/list-student-tasks.use-case';
import { SubmitStudentTaskStageUseCase } from '../application/submit-student-task-stage.use-case';
import {
  SubmitStudentTaskStageDto,
  StudentTaskResponseDto,
  StudentTasksListResponseDto,
  StudentTasksQueryDto,
  StudentTasksSummaryResponseDto,
  StudentTaskSubmissionResponseDto,
  StudentTaskSubmissionsResponseDto,
} from '../dto/student-tasks.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/tasks')
export class StudentTasksController {
  constructor(
    private readonly listStudentTasksUseCase: ListStudentTasksUseCase,
    private readonly getStudentTasksSummaryUseCase: GetStudentTasksSummaryUseCase,
    private readonly getStudentTaskUseCase: GetStudentTaskUseCase,
    private readonly listStudentTaskSubmissionsUseCase: ListStudentTaskSubmissionsUseCase,
    private readonly getStudentTaskSubmissionUseCase: GetStudentTaskSubmissionUseCase,
    private readonly submitStudentTaskStageUseCase: SubmitStudentTaskStageUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentTasksListResponseDto })
  @RequiredPermissions('reinforcement.tasks.view')
  listTasks(
    @Query() query: StudentTasksQueryDto,
  ): Promise<StudentTasksListResponseDto> {
    return this.listStudentTasksUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentTasksSummaryResponseDto })
  @RequiredPermissions('reinforcement.tasks.view')
  getSummary(): Promise<StudentTasksSummaryResponseDto> {
    return this.getStudentTasksSummaryUseCase.execute();
  }

  @Get(':taskId')
  @ApiOkResponse({ type: StudentTaskResponseDto })
  @RequiredPermissions('reinforcement.tasks.view')
  getTask(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ): Promise<StudentTaskResponseDto> {
    return this.getStudentTaskUseCase.execute(taskId);
  }

  @Get(':taskId/submissions')
  @ApiOkResponse({ type: StudentTaskSubmissionsResponseDto })
  @RequiredPermissions('reinforcement.submissions.view')
  listSubmissions(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ): Promise<StudentTaskSubmissionsResponseDto> {
    return this.listStudentTaskSubmissionsUseCase.execute(taskId);
  }

  @Get(':taskId/submissions/:submissionId')
  @ApiOkResponse({ type: StudentTaskSubmissionResponseDto })
  @RequiredPermissions('reinforcement.submissions.view')
  getSubmission(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<StudentTaskSubmissionResponseDto> {
    return this.getStudentTaskSubmissionUseCase.execute({
      taskId,
      submissionId,
    });
  }

  @Post(':taskId/stages/:stageId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentTaskSubmissionResponseDto })
  @RequiredPermissions('reinforcement.submissions.submit')
  submitStage(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Param('stageId', new ParseUUIDPipe()) stageId: string,
    @Body() dto: SubmitStudentTaskStageDto,
  ): Promise<StudentTaskSubmissionResponseDto> {
    return this.submitStudentTaskStageUseCase.execute({
      taskId,
      stageId,
      dto,
    });
  }
}
