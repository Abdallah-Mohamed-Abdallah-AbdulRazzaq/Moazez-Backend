import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentTaskSubmissionUseCase } from '../application/get-student-task-submission.use-case';
import { GetStudentTaskUseCase } from '../application/get-student-task.use-case';
import { GetStudentTasksSummaryUseCase } from '../application/get-student-tasks-summary.use-case';
import { ListStudentTaskSubmissionsUseCase } from '../application/list-student-task-submissions.use-case';
import { ListStudentTasksUseCase } from '../application/list-student-tasks.use-case';
import {
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
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentTasksListResponseDto })
  listTasks(
    @Query() query: StudentTasksQueryDto,
  ): Promise<StudentTasksListResponseDto> {
    return this.listStudentTasksUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentTasksSummaryResponseDto })
  getSummary(): Promise<StudentTasksSummaryResponseDto> {
    return this.getStudentTasksSummaryUseCase.execute();
  }

  @Get(':taskId')
  @ApiOkResponse({ type: StudentTaskResponseDto })
  getTask(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ): Promise<StudentTaskResponseDto> {
    return this.getStudentTaskUseCase.execute(taskId);
  }

  @Get(':taskId/submissions')
  @ApiOkResponse({ type: StudentTaskSubmissionsResponseDto })
  listSubmissions(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ): Promise<StudentTaskSubmissionsResponseDto> {
    return this.listStudentTaskSubmissionsUseCase.execute(taskId);
  }

  @Get(':taskId/submissions/:submissionId')
  @ApiOkResponse({ type: StudentTaskSubmissionResponseDto })
  getSubmission(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<StudentTaskSubmissionResponseDto> {
    return this.getStudentTaskSubmissionUseCase.execute({
      taskId,
      submissionId,
    });
  }
}
