import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BulkSaveStudentExamAnswersUseCase } from '../application/bulk-save-student-exam-answers.use-case';
import { GetStudentExamSubmissionUseCase } from '../application/get-student-exam-submission.use-case';
import { GetStudentExamUseCase } from '../application/get-student-exam.use-case';
import { ListStudentExamsUseCase } from '../application/list-student-exams.use-case';
import { SaveStudentExamAnswerUseCase } from '../application/save-student-exam-answer.use-case';
import { StartStudentExamSubmissionUseCase } from '../application/start-student-exam-submission.use-case';
import { SubmitStudentExamSubmissionUseCase } from '../application/submit-student-exam-submission.use-case';
import {
  StudentExamBulkSaveAnswersDto,
  StudentExamDetailResponseDto,
  StudentExamSaveAnswerDto,
  StudentExamSubmissionStateResponseDto,
  StudentExamsListResponseDto,
  StudentExamsQueryDto,
} from '../dto/student-exams.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/exams')
export class StudentExamsController {
  constructor(
    private readonly listStudentExamsUseCase: ListStudentExamsUseCase,
    private readonly getStudentExamUseCase: GetStudentExamUseCase,
    private readonly getStudentExamSubmissionUseCase: GetStudentExamSubmissionUseCase,
    private readonly startStudentExamSubmissionUseCase: StartStudentExamSubmissionUseCase,
    private readonly bulkSaveStudentExamAnswersUseCase: BulkSaveStudentExamAnswersUseCase,
    private readonly saveStudentExamAnswerUseCase: SaveStudentExamAnswerUseCase,
    private readonly submitStudentExamSubmissionUseCase: SubmitStudentExamSubmissionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentExamsListResponseDto })
  listExams(
    @Query() query: StudentExamsQueryDto,
  ): Promise<StudentExamsListResponseDto> {
    return this.listStudentExamsUseCase.execute(query);
  }

  @Get(':assessmentId')
  @ApiOkResponse({ type: StudentExamDetailResponseDto })
  getExam(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<StudentExamDetailResponseDto> {
    return this.getStudentExamUseCase.execute(assessmentId);
  }

  @Get(':assessmentId/submission')
  @ApiOkResponse({ type: StudentExamSubmissionStateResponseDto })
  getExamSubmission(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    return this.getStudentExamSubmissionUseCase.execute(assessmentId);
  }

  @Post(':assessmentId/start')
  @ApiOkResponse({ type: StudentExamSubmissionStateResponseDto })
  startExamSubmission(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    return this.startStudentExamSubmissionUseCase.execute(assessmentId);
  }

  @Put(':assessmentId/submission/answers')
  @ApiOkResponse({ type: StudentExamSubmissionStateResponseDto })
  bulkSaveExamAnswers(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() body: StudentExamBulkSaveAnswersDto,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    return this.bulkSaveStudentExamAnswersUseCase.execute(assessmentId, body);
  }

  @Patch(':assessmentId/submission/answers/:questionId')
  @ApiOkResponse({ type: StudentExamSubmissionStateResponseDto })
  saveExamAnswer(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() body: StudentExamSaveAnswerDto,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    return this.saveStudentExamAnswerUseCase.execute({
      assessmentId,
      questionId,
      command: body,
    });
  }

  @Post(':assessmentId/submission/submit')
  @ApiOkResponse({ type: StudentExamSubmissionStateResponseDto })
  submitExamSubmission(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    return this.submitStudentExamSubmissionUseCase.execute(assessmentId);
  }
}
