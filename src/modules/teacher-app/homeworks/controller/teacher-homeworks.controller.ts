import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CancelTeacherHomeworkAssignmentUseCase,
  CloseTeacherHomeworkAssignmentUseCase,
  CreateTeacherHomeworkAssignmentUseCase,
  GetTeacherHomeworkAssignmentUseCase,
  GetTeacherHomeworkSubmissionUseCase,
  GetTeacherHomeworksDashboardUseCase,
  ListTeacherHomeworkAssignmentsUseCase,
  ListTeacherHomeworkSubmissionsUseCase,
  ListTeacherHomeworkTargetsUseCase,
  PublishTeacherHomeworkAssignmentUseCase,
  ReviewTeacherHomeworkSubmissionUseCase,
  ResolveTeacherHomeworkTargetsUseCase,
  UpdateTeacherHomeworkAssignmentUseCase,
} from '../application/teacher-homeworks.use-cases';
import {
  ListTeacherHomeworkAssignmentsQueryDto,
  ListTeacherHomeworkSubmissionsQueryDto,
  TeacherHomeworkAssignmentDto,
  TeacherHomeworkAssignmentParamsDto,
  TeacherHomeworkAssignmentsListResponseDto,
  TeacherHomeworkClassParamsDto,
  TeacherHomeworkCreateDto,
  TeacherHomeworkDashboardResponseDto,
  TeacherHomeworkSubmissionParamsDto,
  TeacherHomeworkSubmissionResponseDto,
  TeacherHomeworkSubmissionReviewDto,
  TeacherHomeworkSubmissionsListResponseDto,
  TeacherHomeworkTargetsListResponseDto,
  TeacherHomeworkUpdateDto,
} from '../dto/teacher-homeworks.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/homeworks')
export class TeacherHomeworksController {
  constructor(
    private readonly getDashboardUseCase: GetTeacherHomeworksDashboardUseCase,
    private readonly listAssignmentsUseCase: ListTeacherHomeworkAssignmentsUseCase,
    private readonly createAssignmentUseCase: CreateTeacherHomeworkAssignmentUseCase,
    private readonly getAssignmentUseCase: GetTeacherHomeworkAssignmentUseCase,
    private readonly updateAssignmentUseCase: UpdateTeacherHomeworkAssignmentUseCase,
    private readonly publishAssignmentUseCase: PublishTeacherHomeworkAssignmentUseCase,
    private readonly closeAssignmentUseCase: CloseTeacherHomeworkAssignmentUseCase,
    private readonly cancelAssignmentUseCase: CancelTeacherHomeworkAssignmentUseCase,
    private readonly listTargetsUseCase: ListTeacherHomeworkTargetsUseCase,
    private readonly resolveTargetsUseCase: ResolveTeacherHomeworkTargetsUseCase,
    private readonly listSubmissionsUseCase: ListTeacherHomeworkSubmissionsUseCase,
    private readonly getSubmissionUseCase: GetTeacherHomeworkSubmissionUseCase,
    private readonly reviewSubmissionUseCase: ReviewTeacherHomeworkSubmissionUseCase,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get the current teacher homework dashboard' })
  @ApiOkResponse({ type: TeacherHomeworkDashboardResponseDto })
  getDashboard(): Promise<TeacherHomeworkDashboardResponseDto> {
    return this.getDashboardUseCase.execute();
  }

  @Get('classes/:classId/assignments')
  @ApiOperation({ summary: 'List homework assignments for an owned class' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mode', required: false })
  @ApiQuery({ name: 'dueFrom', required: false })
  @ApiQuery({ name: 'dueTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentsListResponseDto })
  listAssignments(
    @Param() params: TeacherHomeworkClassParamsDto,
    @Query() query: ListTeacherHomeworkAssignmentsQueryDto,
  ): Promise<TeacherHomeworkAssignmentsListResponseDto> {
    return this.listAssignmentsUseCase.execute(params.classId, query);
  }

  @Post('classes/:classId/assignments')
  @ApiOperation({
    summary: 'Create a draft homework assignment for an owned class',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiBody({ type: TeacherHomeworkCreateDto })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  createAssignment(
    @Param() params: TeacherHomeworkClassParamsDto,
    @Body() dto: TeacherHomeworkCreateDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.createAssignmentUseCase.execute(params.classId, dto);
  }

  @Get('classes/:classId/assignments/:homeworkId')
  @ApiOperation({ summary: 'Get an owned homework assignment' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  getAssignment(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.getAssignmentUseCase.execute(params.classId, params.homeworkId);
  }

  @Patch('classes/:classId/assignments/:homeworkId')
  @ApiOperation({ summary: 'Update an owned draft homework assignment' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: TeacherHomeworkUpdateDto })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  updateAssignment(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
    @Body() dto: TeacherHomeworkUpdateDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.updateAssignmentUseCase.execute(
      params.classId,
      params.homeworkId,
      dto,
    );
  }

  @Post('classes/:classId/assignments/:homeworkId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish an owned draft homework assignment' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  publishAssignment(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.publishAssignmentUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Post('classes/:classId/assignments/:homeworkId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close an owned published homework assignment' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  closeAssignment(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.closeAssignmentUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Post('classes/:classId/assignments/:homeworkId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an owned draft or published homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  cancelAssignment(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.cancelAssignmentUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/targets')
  @ApiOperation({
    summary: 'List safe target rows for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkTargetsListResponseDto })
  listTargets(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<TeacherHomeworkTargetsListResponseDto> {
    return this.listTargetsUseCase.execute(params.classId, params.homeworkId);
  }

  @Post('classes/:classId/assignments/:homeworkId/targets/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh targets for an owned draft homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkAssignmentDto })
  resolveTargets(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    return this.resolveTargetsUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/submissions')
  @ApiOperation({
    summary: 'List submitted homework submissions for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: TeacherHomeworkSubmissionsListResponseDto })
  listSubmissions(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
    @Query() query: ListTeacherHomeworkSubmissionsQueryDto,
  ): Promise<TeacherHomeworkSubmissionsListResponseDto> {
    return this.listSubmissionsUseCase.execute(
      params.classId,
      params.homeworkId,
      query,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/submissions/:submissionId')
  @ApiOperation({
    summary: 'Get one submitted homework submission for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherHomeworkSubmissionResponseDto })
  getSubmission(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
  ): Promise<TeacherHomeworkSubmissionResponseDto> {
    return this.getSubmissionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.submissionId,
    );
  }

  @Post(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Review a submitted homework submission for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiBody({ type: TeacherHomeworkSubmissionReviewDto })
  @ApiOkResponse({ type: TeacherHomeworkSubmissionResponseDto })
  reviewSubmission(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
    @Body() dto: TeacherHomeworkSubmissionReviewDto,
  ): Promise<TeacherHomeworkSubmissionResponseDto> {
    return this.reviewSubmissionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.submissionId,
      dto,
    );
  }
}
