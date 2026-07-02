import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  BulkReviewTeacherHomeworkSubmissionAnswersUseCase,
  CancelTeacherHomeworkAssignmentUseCase,
  CloseTeacherHomeworkAssignmentUseCase,
  CreateTeacherHomeworkAttachmentUseCase,
  CreateTeacherHomeworkAssignmentUseCase,
  CreateTeacherHomeworkQuestionOptionUseCase,
  CreateTeacherHomeworkQuestionUseCase,
  DeleteTeacherHomeworkAttachmentUseCase,
  DeleteTeacherHomeworkQuestionOptionUseCase,
  DeleteTeacherHomeworkQuestionUseCase,
  GetTeacherHomeworkAssignmentUseCase,
  GetTeacherHomeworkGradeSyncStatusUseCase,
  GetTeacherHomeworkQuestionUseCase,
  GetTeacherHomeworkSubmissionUseCase,
  GetTeacherHomeworksDashboardUseCase,
  ListTeacherHomeworkAttachmentsUseCase,
  ListTeacherHomeworkAssignmentsUseCase,
  ListTeacherHomeworkQuestionsUseCase,
  ListTeacherHomeworkSubmissionAnswersUseCase,
  ListTeacherHomeworkSubmissionAttachmentsUseCase,
  ListTeacherHomeworkSubmissionsUseCase,
  ListTeacherHomeworkTargetsUseCase,
  PublishTeacherHomeworkAssignmentUseCase,
  ReorderTeacherHomeworkAttachmentUseCase,
  ReorderTeacherHomeworkQuestionOptionUseCase,
  ReorderTeacherHomeworkQuestionUseCase,
  ReviewTeacherHomeworkSubmissionAnswerUseCase,
  ReviewTeacherHomeworkSubmissionUseCase,
  ResolveTeacherHomeworkTargetsUseCase,
  SyncTeacherHomeworkAssignmentToGradesUseCase,
  SyncTeacherHomeworkSubmissionToGradesUseCase,
  UpdateTeacherHomeworkAttachmentUseCase,
  UpdateTeacherHomeworkAssignmentUseCase,
  UpdateTeacherHomeworkQuestionOptionUseCase,
  UpdateTeacherHomeworkQuestionUseCase,
} from '../application/teacher-homeworks.use-cases';
import {
  CreateHomeworkAttachmentDto,
  ReorderHomeworkAttachmentDto,
  UpdateHomeworkAttachmentDto,
} from '../../../homework/dto/homework-attachment.dto';
import {
  HomeworkAttachmentDetailResponseDto,
  HomeworkAttachmentsListResponseDto,
} from '../../../homework/dto/homework-attachment-response.dto';
import {
  CreateHomeworkQuestionDto,
  CreateHomeworkQuestionOptionDto,
  ReorderHomeworkQuestionDto,
  ReorderHomeworkQuestionOptionDto,
  UpdateHomeworkQuestionDto,
  UpdateHomeworkQuestionOptionDto,
} from '../../../homework/dto/homework-question.dto';
import {
  HomeworkQuestionDetailResponseDto,
  HomeworkQuestionsListResponseDto,
} from '../../../homework/dto/homework-question-response.dto';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../../../homework/dto/homework-answer-response.dto';
import {
  BulkReviewHomeworkAnswersDto,
  ReviewHomeworkAnswerDto,
} from '../../../homework/dto/homework-answer.dto';
import { HomeworkSubmissionAttachmentsListResponseDto } from '../../../homework/dto/homework-submission-attachment-response.dto';
import {
  HomeworkGradeSyncResponseDto,
  HomeworkGradeSyncStatusResponseDto,
} from '../../../homework/dto/homework-grade-sync.dto';
import {
  ListTeacherHomeworkAssignmentsQueryDto,
  ListTeacherHomeworkSubmissionsQueryDto,
  TeacherHomeworkAssignmentDto,
  TeacherHomeworkAssignmentParamsDto,
  TeacherHomeworkAssignmentsListResponseDto,
  TeacherHomeworkAttachmentParamsDto,
  TeacherHomeworkClassParamsDto,
  TeacherHomeworkCreateDto,
  TeacherHomeworkDashboardResponseDto,
  TeacherHomeworkQuestionOptionParamsDto,
  TeacherHomeworkQuestionParamsDto,
  TeacherHomeworkSubmissionAnswerParamsDto,
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
    private readonly listQuestionsUseCase: ListTeacherHomeworkQuestionsUseCase,
    private readonly createQuestionUseCase: CreateTeacherHomeworkQuestionUseCase,
    private readonly getQuestionUseCase: GetTeacherHomeworkQuestionUseCase,
    private readonly updateQuestionUseCase: UpdateTeacherHomeworkQuestionUseCase,
    private readonly reorderQuestionUseCase: ReorderTeacherHomeworkQuestionUseCase,
    private readonly deleteQuestionUseCase: DeleteTeacherHomeworkQuestionUseCase,
    private readonly createOptionUseCase: CreateTeacherHomeworkQuestionOptionUseCase,
    private readonly updateOptionUseCase: UpdateTeacherHomeworkQuestionOptionUseCase,
    private readonly reorderOptionUseCase: ReorderTeacherHomeworkQuestionOptionUseCase,
    private readonly deleteOptionUseCase: DeleteTeacherHomeworkQuestionOptionUseCase,
    private readonly listAttachmentsUseCase: ListTeacherHomeworkAttachmentsUseCase,
    private readonly createAttachmentUseCase: CreateTeacherHomeworkAttachmentUseCase,
    private readonly updateAttachmentUseCase: UpdateTeacherHomeworkAttachmentUseCase,
    private readonly reorderAttachmentUseCase: ReorderTeacherHomeworkAttachmentUseCase,
    private readonly deleteAttachmentUseCase: DeleteTeacherHomeworkAttachmentUseCase,
    private readonly listSubmissionsUseCase: ListTeacherHomeworkSubmissionsUseCase,
    private readonly getSubmissionUseCase: GetTeacherHomeworkSubmissionUseCase,
    private readonly listSubmissionAnswersUseCase: ListTeacherHomeworkSubmissionAnswersUseCase,
    private readonly reviewSubmissionAnswerUseCase: ReviewTeacherHomeworkSubmissionAnswerUseCase,
    private readonly bulkReviewSubmissionAnswersUseCase: BulkReviewTeacherHomeworkSubmissionAnswersUseCase,
    private readonly listSubmissionAttachmentsUseCase: ListTeacherHomeworkSubmissionAttachmentsUseCase,
    private readonly reviewSubmissionUseCase: ReviewTeacherHomeworkSubmissionUseCase,
    private readonly getGradeSyncStatusUseCase: GetTeacherHomeworkGradeSyncStatusUseCase,
    private readonly syncAssignmentToGradesUseCase: SyncTeacherHomeworkAssignmentToGradesUseCase,
    private readonly syncSubmissionToGradesUseCase: SyncTeacherHomeworkSubmissionToGradesUseCase,
  ) {}

  @Get('dashboard')
  @RequiredPermissions('homework.assignments.view')
  @ApiOperation({ summary: 'Get the current teacher homework dashboard' })
  @ApiOkResponse({ type: TeacherHomeworkDashboardResponseDto })
  getDashboard(): Promise<TeacherHomeworkDashboardResponseDto> {
    return this.getDashboardUseCase.execute();
  }

  @Get('classes/:classId/assignments')
  @RequiredPermissions('homework.assignments.view')
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
  @RequiredPermissions('homework.assignments.view')
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
  @RequiredPermissions('homework.targets.view')
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

  @Get('classes/:classId/assignments/:homeworkId/grade-sync')
  @RequiredPermissions('homework.grade_sync.view')
  @ApiOperation({ summary: 'Get grade sync status for an owned homework' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkGradeSyncStatusResponseDto })
  getGradeSyncStatus(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<HomeworkGradeSyncStatusResponseDto> {
    return this.getGradeSyncStatusUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Post('classes/:classId/assignments/:homeworkId/grade-sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync reviewed owned homework submissions to Grades',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkGradeSyncResponseDto })
  syncAssignmentToGrades(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<HomeworkGradeSyncResponseDto> {
    return this.syncAssignmentToGradesUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/questions')
  @RequiredPermissions('homework.questions.view')
  @ApiOperation({ summary: 'List questions for an owned homework assignment' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkQuestionsListResponseDto })
  listQuestions(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<HomeworkQuestionsListResponseDto> {
    return this.listQuestionsUseCase.execute(params.classId, params.homeworkId);
  }

  @Post('classes/:classId/assignments/:homeworkId/questions')
  @ApiOperation({
    summary: 'Create a question for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: CreateHomeworkQuestionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  createQuestion(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
    @Body() dto: CreateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.createQuestionUseCase.execute(
      params.classId,
      params.homeworkId,
      dto,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/questions/:questionId')
  @RequiredPermissions('homework.questions.view')
  @ApiOperation({
    summary: 'Get one question for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  getQuestion(
    @Param() params: TeacherHomeworkQuestionParamsDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.getQuestionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
    );
  }

  @Patch('classes/:classId/assignments/:homeworkId/questions/:questionId')
  @ApiOperation({
    summary: 'Update a question for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkQuestionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  updateQuestion(
    @Param() params: TeacherHomeworkQuestionParamsDto,
    @Body() dto: UpdateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.updateQuestionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
      dto,
    );
  }

  @Patch(
    'classes/:classId/assignments/:homeworkId/questions/:questionId/reorder',
  )
  @ApiOperation({
    summary: 'Reorder a question for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiBody({ type: ReorderHomeworkQuestionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  reorderQuestion(
    @Param() params: TeacherHomeworkQuestionParamsDto,
    @Body() dto: ReorderHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.reorderQuestionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
      dto,
    );
  }

  @Delete('classes/:classId/assignments/:homeworkId/questions/:questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a question for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  deleteQuestion(
    @Param() params: TeacherHomeworkQuestionParamsDto,
  ): Promise<void> {
    return this.deleteQuestionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
    );
  }

  @Post(
    'classes/:classId/assignments/:homeworkId/questions/:questionId/options',
  )
  @ApiOperation({ summary: 'Create an option for an owned homework question' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiBody({ type: CreateHomeworkQuestionOptionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  createOption(
    @Param() params: TeacherHomeworkQuestionParamsDto,
    @Body() dto: CreateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.createOptionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
      dto,
    );
  }

  @Patch(
    'classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId',
  )
  @ApiOperation({ summary: 'Update an option for an owned homework question' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkQuestionOptionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  updateOption(
    @Param() params: TeacherHomeworkQuestionOptionParamsDto,
    @Body() dto: UpdateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.updateOptionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
      params.optionId,
      dto,
    );
  }

  @Patch(
    'classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId/reorder',
  )
  @ApiOperation({ summary: 'Reorder an option for an owned homework question' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiBody({ type: ReorderHomeworkQuestionOptionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  reorderOption(
    @Param() params: TeacherHomeworkQuestionOptionParamsDto,
    @Body() dto: ReorderHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.reorderOptionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
      params.optionId,
      dto,
    );
  }

  @Delete(
    'classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId',
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete an option for an owned homework question',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  async deleteOption(
    @Param() params: TeacherHomeworkQuestionOptionParamsDto,
  ): Promise<void> {
    await this.deleteOptionUseCase.execute(
      params.classId,
      params.homeworkId,
      params.questionId,
      params.optionId,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/attachments')
  @RequiredPermissions('homework.attachments.view')
  @ApiOperation({
    summary: 'List attachments for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAttachmentsListResponseDto })
  listAttachments(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
  ): Promise<HomeworkAttachmentsListResponseDto> {
    return this.listAttachmentsUseCase.execute(
      params.classId,
      params.homeworkId,
    );
  }

  @Post('classes/:classId/assignments/:homeworkId/attachments')
  @ApiOperation({ summary: 'Attach a file to an owned homework assignment' })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: CreateHomeworkAttachmentDto })
  @ApiOkResponse({ type: HomeworkAttachmentDetailResponseDto })
  createAttachment(
    @Param() params: TeacherHomeworkAssignmentParamsDto,
    @Body() dto: CreateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    return this.createAttachmentUseCase.execute(
      params.classId,
      params.homeworkId,
      dto,
    );
  }

  @Patch('classes/:classId/assignments/:homeworkId/attachments/:attachmentId')
  @ApiOperation({
    summary: 'Update an attachment for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkAttachmentDto })
  @ApiOkResponse({ type: HomeworkAttachmentDetailResponseDto })
  updateAttachment(
    @Param() params: TeacherHomeworkAttachmentParamsDto,
    @Body() dto: UpdateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    return this.updateAttachmentUseCase.execute(
      params.classId,
      params.homeworkId,
      params.attachmentId,
      dto,
    );
  }

  @Patch(
    'classes/:classId/assignments/:homeworkId/attachments/:attachmentId/reorder',
  )
  @ApiOperation({
    summary: 'Reorder an attachment for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiBody({ type: ReorderHomeworkAttachmentDto })
  @ApiOkResponse({ type: HomeworkAttachmentDetailResponseDto })
  reorderAttachment(
    @Param() params: TeacherHomeworkAttachmentParamsDto,
    @Body() dto: ReorderHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    return this.reorderAttachmentUseCase.execute(
      params.classId,
      params.homeworkId,
      params.attachmentId,
      dto,
    );
  }

  @Delete('classes/:classId/assignments/:homeworkId/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete an attachment for an owned homework assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  deleteAttachment(
    @Param() params: TeacherHomeworkAttachmentParamsDto,
  ): Promise<void> {
    return this.deleteAttachmentUseCase.execute(
      params.classId,
      params.homeworkId,
      params.attachmentId,
    );
  }

  @Get('classes/:classId/assignments/:homeworkId/submissions')
  @RequiredPermissions('homework.submissions.view')
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
  @RequiredPermissions('homework.submissions.view')
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

  @Get(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers',
  )
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({
    summary: 'List submitted homework answers for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAnswersListResponseDto })
  listSubmissionAnswers(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
  ): Promise<HomeworkAnswersListResponseDto> {
    return this.listSubmissionAnswersUseCase.execute(
      params.classId,
      params.homeworkId,
      params.submissionId,
    );
  }

  @Patch(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review',
  )
  @ApiOperation({
    summary: 'Review one submitted homework answer for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiParam({ name: 'answerId', format: 'uuid' })
  @ApiBody({ type: ReviewHomeworkAnswerDto })
  @ApiOkResponse({ type: HomeworkAnswerDetailResponseDto })
  reviewSubmissionAnswer(
    @Param() params: TeacherHomeworkSubmissionAnswerParamsDto,
    @Body() dto: ReviewHomeworkAnswerDto,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    return this.reviewSubmissionAnswerUseCase.execute(
      params.classId,
      params.homeworkId,
      params.submissionId,
      params.answerId,
      dto,
    );
  }

  @Put(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/review',
  )
  @ApiOperation({
    summary: 'Bulk review submitted homework answers for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiBody({ type: BulkReviewHomeworkAnswersDto })
  @ApiOkResponse({ type: HomeworkAnswersListResponseDto })
  bulkReviewSubmissionAnswers(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
    @Body() dto: BulkReviewHomeworkAnswersDto,
  ): Promise<HomeworkAnswersListResponseDto> {
    return this.bulkReviewSubmissionAnswersUseCase.execute(
      params.classId,
      params.homeworkId,
      params.submissionId,
      dto,
    );
  }

  @Get(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments',
  )
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({
    summary: 'List submitted homework attachments for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkSubmissionAttachmentsListResponseDto })
  listSubmissionAttachments(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
  ): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    return this.listSubmissionAttachmentsUseCase.execute(
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

  @Patch(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
  )
  @ApiOperation({
    summary: 'Review a submitted homework submission for an owned assignment',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiBody({ type: TeacherHomeworkSubmissionReviewDto })
  @ApiOkResponse({ type: TeacherHomeworkSubmissionResponseDto })
  patchReviewSubmission(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
    @Body() dto: TeacherHomeworkSubmissionReviewDto,
  ): Promise<TeacherHomeworkSubmissionResponseDto> {
    return this.reviewSubmission(params, dto);
  }

  @Post(
    'classes/:classId/assignments/:homeworkId/submissions/:submissionId/grade-sync',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync one reviewed owned homework submission to Grades',
  })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkGradeSyncResponseDto })
  syncSubmissionToGrades(
    @Param() params: TeacherHomeworkSubmissionParamsDto,
  ): Promise<HomeworkGradeSyncResponseDto> {
    return this.syncSubmissionToGradesUseCase.execute(
      params.classId,
      params.homeworkId,
      params.submissionId,
    );
  }
}
