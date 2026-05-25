import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetStudentHomeworkUseCase,
  GetStudentHomeworkSubmissionUseCase,
  ListStudentHomeworksUseCase,
  SaveStudentHomeworkSubmissionUseCase,
  SubmitStudentHomeworkSubmissionUseCase,
} from '../application/student-homeworks.use-cases';
import {
  StudentHomeworkSubmissionBodyDto,
  StudentHomeworkSubmissionResponseDto,
  StudentHomeworkSubmitBodyDto,
  StudentHomeworkResponseDto,
  StudentHomeworksListResponseDto,
  StudentHomeworksQueryDto,
} from '../dto/student-homeworks.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/homeworks')
export class StudentHomeworksController {
  constructor(
    private readonly listStudentHomeworksUseCase: ListStudentHomeworksUseCase,
    private readonly getStudentHomeworkUseCase: GetStudentHomeworkUseCase,
    private readonly getStudentHomeworkSubmissionUseCase: GetStudentHomeworkSubmissionUseCase,
    private readonly saveStudentHomeworkSubmissionUseCase: SaveStudentHomeworkSubmissionUseCase,
    private readonly submitStudentHomeworkSubmissionUseCase: SubmitStudentHomeworkSubmissionUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List homework assigned to the current student' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mode', required: false })
  @ApiQuery({ name: 'dueFrom', required: false })
  @ApiQuery({ name: 'dueTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: StudentHomeworksListResponseDto })
  listHomeworks(
    @Query() query: StudentHomeworksQueryDto,
  ): Promise<StudentHomeworksListResponseDto> {
    return this.listStudentHomeworksUseCase.execute(query);
  }

  @Get(':homeworkId')
  @ApiOperation({ summary: 'Get assigned homework details' })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: StudentHomeworkResponseDto })
  getHomework(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<StudentHomeworkResponseDto> {
    return this.getStudentHomeworkUseCase.execute(homeworkId);
  }

  @Get(':homeworkId/submission')
  @ApiOperation({ summary: 'Get current student homework submission' })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  getSubmission(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.getStudentHomeworkSubmissionUseCase.execute(homeworkId);
  }

  @Put(':homeworkId/submission')
  @ApiOperation({ summary: 'Save current student homework submission draft' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: StudentHomeworkSubmissionBodyDto })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  saveSubmissionDraft(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: StudentHomeworkSubmissionBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.saveStudentHomeworkSubmissionUseCase.execute(homeworkId, dto);
  }

  @Post(':homeworkId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit current student homework' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: StudentHomeworkSubmitBodyDto })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  submitHomework(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: StudentHomeworkSubmitBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.submitStudentHomeworkSubmissionUseCase.execute(
      homeworkId,
      dto,
    );
  }
}
