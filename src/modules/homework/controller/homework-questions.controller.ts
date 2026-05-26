import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  CreateHomeworkQuestionOptionUseCase,
  CreateHomeworkQuestionUseCase,
  DeleteHomeworkQuestionOptionUseCase,
  DeleteHomeworkQuestionUseCase,
  GetHomeworkQuestionUseCase,
  ListHomeworkQuestionsUseCase,
  ReorderHomeworkQuestionOptionUseCase,
  ReorderHomeworkQuestionUseCase,
  UpdateHomeworkQuestionOptionUseCase,
  UpdateHomeworkQuestionUseCase,
} from '../application/homework-questions.use-cases';
import {
  CreateHomeworkQuestionDto,
  CreateHomeworkQuestionOptionDto,
  ReorderHomeworkQuestionDto,
  ReorderHomeworkQuestionOptionDto,
  UpdateHomeworkQuestionDto,
  UpdateHomeworkQuestionOptionDto,
} from '../dto/homework-question.dto';
import {
  HomeworkQuestionDetailResponseDto,
  HomeworkQuestionsListResponseDto,
} from '../dto/homework-question-response.dto';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller('homework/assignments/:homeworkId/questions')
export class HomeworkQuestionsController {
  constructor(
    private readonly listQuestionsUseCase: ListHomeworkQuestionsUseCase,
    private readonly getQuestionUseCase: GetHomeworkQuestionUseCase,
    private readonly createQuestionUseCase: CreateHomeworkQuestionUseCase,
    private readonly updateQuestionUseCase: UpdateHomeworkQuestionUseCase,
    private readonly reorderQuestionUseCase: ReorderHomeworkQuestionUseCase,
    private readonly deleteQuestionUseCase: DeleteHomeworkQuestionUseCase,
    private readonly createOptionUseCase: CreateHomeworkQuestionOptionUseCase,
    private readonly updateOptionUseCase: UpdateHomeworkQuestionOptionUseCase,
    private readonly reorderOptionUseCase: ReorderHomeworkQuestionOptionUseCase,
    private readonly deleteOptionUseCase: DeleteHomeworkQuestionOptionUseCase,
  ) {}

  @Get()
  @RequiredPermissions('homework.assignments.view')
  @ApiOperation({ summary: 'List homework assignment questions' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkQuestionsListResponseDto })
  listQuestions(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkQuestionsListResponseDto> {
    return this.listQuestionsUseCase.execute(homeworkId);
  }

  @Post()
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Create a homework assignment question' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: CreateHomeworkQuestionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  createQuestion(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: CreateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.createQuestionUseCase.execute(homeworkId, dto);
  }

  @Get(':questionId')
  @RequiredPermissions('homework.assignments.view')
  @ApiOperation({ summary: 'Get a homework assignment question' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  getQuestion(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.getQuestionUseCase.execute({ homeworkId, questionId });
  }

  @Patch(':questionId')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Update a homework assignment question' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkQuestionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  updateQuestion(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: UpdateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.updateQuestionUseCase.execute(homeworkId, questionId, dto);
  }

  @Patch(':questionId/reorder')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Reorder a homework assignment question' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiBody({ type: ReorderHomeworkQuestionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  reorderQuestion(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: ReorderHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.reorderQuestionUseCase.execute(homeworkId, questionId, dto);
  }

  @Delete(':questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Soft delete a homework assignment question' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  deleteQuestion(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<void> {
    return this.deleteQuestionUseCase.execute(homeworkId, questionId);
  }

  @Post(':questionId/options')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Create a homework question option' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiBody({ type: CreateHomeworkQuestionOptionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  createOption(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.createOptionUseCase.execute(homeworkId, questionId, dto);
  }

  @Patch(':questionId/options/:optionId')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Update a homework question option' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkQuestionOptionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  updateOption(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: UpdateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.updateOptionUseCase.execute(
      homeworkId,
      questionId,
      optionId,
      dto,
    );
  }

  @Patch(':questionId/options/:optionId/reorder')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Reorder a homework question option' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiBody({ type: ReorderHomeworkQuestionOptionDto })
  @ApiOkResponse({ type: HomeworkQuestionDetailResponseDto })
  reorderOption(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: ReorderHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    return this.reorderOptionUseCase.execute(
      homeworkId,
      questionId,
      optionId,
      dto,
    );
  }

  @Delete(':questionId/options/:optionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Soft delete a homework question option' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  async deleteOption(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
  ): Promise<void> {
    await this.deleteOptionUseCase.execute(homeworkId, questionId, optionId);
  }
}
