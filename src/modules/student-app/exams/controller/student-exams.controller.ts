import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentExamSubmissionUseCase } from '../application/get-student-exam-submission.use-case';
import { GetStudentExamUseCase } from '../application/get-student-exam.use-case';
import { ListStudentExamsUseCase } from '../application/list-student-exams.use-case';
import {
  StudentExamDetailResponseDto,
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
}
