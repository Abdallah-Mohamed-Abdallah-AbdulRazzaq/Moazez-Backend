import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  GetHomeworkGradeSyncStatusUseCase,
  LinkHomeworkGradeAssessmentUseCase,
  SyncHomeworkAssignmentToGradesUseCase,
  SyncHomeworkSubmissionToGradesUseCase,
} from '../application/homework-grade-sync.use-cases';
import {
  HomeworkGradeSyncResponseDto,
  HomeworkGradeSyncStatusResponseDto,
  LinkHomeworkGradeAssessmentDto,
} from '../dto/homework-grade-sync.dto';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller('homework/assignments/:homeworkId')
export class HomeworkGradeSyncController {
  constructor(
    private readonly getGradeSyncStatusUseCase: GetHomeworkGradeSyncStatusUseCase,
    private readonly linkGradeAssessmentUseCase: LinkHomeworkGradeAssessmentUseCase,
    private readonly syncAssignmentUseCase: SyncHomeworkAssignmentToGradesUseCase,
    private readonly syncSubmissionUseCase: SyncHomeworkSubmissionToGradesUseCase,
  ) {}

  @Get('grade-sync')
  @RequiredPermissions('homework.assignments.view', 'grades.items.view')
  @ApiOperation({ summary: 'Get homework grade sync status' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkGradeSyncStatusResponseDto })
  getStatus(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkGradeSyncStatusResponseDto> {
    return this.getGradeSyncStatusUseCase.execute(homeworkId);
  }

  @Post('grade-sync/link')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions(
    'homework.assignments.manage',
    'grades.assessments.manage',
  )
  @ApiOperation({ summary: 'Link homework to a grade assessment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: LinkHomeworkGradeAssessmentDto })
  @ApiOkResponse({ type: HomeworkGradeSyncStatusResponseDto })
  linkGradeAssessment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: LinkHomeworkGradeAssessmentDto,
  ): Promise<HomeworkGradeSyncStatusResponseDto> {
    return this.linkGradeAssessmentUseCase.execute(homeworkId, dto);
  }

  @Post('grade-sync')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.assignments.manage', 'grades.items.manage')
  @ApiOperation({ summary: 'Sync reviewed homework submissions to Grades' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkGradeSyncResponseDto })
  syncAssignment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkGradeSyncResponseDto> {
    return this.syncAssignmentUseCase.execute(homeworkId);
  }

  @Post('submissions/:submissionId/grade-sync')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.assignments.manage', 'grades.items.manage')
  @ApiOperation({ summary: 'Sync one reviewed homework submission to Grades' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkGradeSyncResponseDto })
  syncSubmission(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<HomeworkGradeSyncResponseDto> {
    return this.syncSubmissionUseCase.execute({ homeworkId, submissionId });
  }
}
