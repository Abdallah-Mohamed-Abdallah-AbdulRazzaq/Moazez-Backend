import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { BulkSaveGradeSubmissionAnswersUseCase } from '../application/bulk-save-grade-submission-answers.use-case';
import { GetGradeSubmissionUseCase } from '../application/get-grade-submission.use-case';
import { ListGradeSubmissionsUseCase } from '../application/list-grade-submissions.use-case';
import { ResolveGradeSubmissionUseCase } from '../application/resolve-grade-submission.use-case';
import { SaveGradeSubmissionAnswerUseCase } from '../application/save-grade-submission-answer.use-case';
import { SubmitGradeSubmissionUseCase } from '../application/submit-grade-submission.use-case';
import {
  BulkSaveGradeSubmissionAnswersDto,
  BulkSaveGradeSubmissionAnswersResponseDto,
  GradeSubmissionAnswerResponseDto,
  GradeSubmissionResponseDto,
  GradeSubmissionsListResponseDto,
  ListGradeSubmissionsQueryDto,
  ResolveGradeSubmissionDto,
  SaveGradeSubmissionAnswerDto,
} from '../dto/grade-submission.dto';

@ApiTags('grades-submissions')
@ApiBearerAuth()
@Controller('grades')
export class GradesSubmissionsController {
  constructor(
    private readonly listGradeSubmissionsUseCase: ListGradeSubmissionsUseCase,
    private readonly resolveGradeSubmissionUseCase: ResolveGradeSubmissionUseCase,
    private readonly getGradeSubmissionUseCase: GetGradeSubmissionUseCase,
    private readonly saveGradeSubmissionAnswerUseCase: SaveGradeSubmissionAnswerUseCase,
    private readonly bulkSaveGradeSubmissionAnswersUseCase: BulkSaveGradeSubmissionAnswersUseCase,
    private readonly submitGradeSubmissionUseCase: SubmitGradeSubmissionUseCase,
  ) {}

  @Get('assessments/:assessmentId/submissions')
  @RequiredPermissions('grades.submissions.view')
  listSubmissions(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Query() query: ListGradeSubmissionsQueryDto,
  ): Promise<GradeSubmissionsListResponseDto> {
    return this.listGradeSubmissionsUseCase.execute(assessmentId, query);
  }

  @Post('assessments/:assessmentId/submissions/resolve')
  @RequiredPermissions('grades.submissions.submit')
  resolveSubmission(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: ResolveGradeSubmissionDto,
  ): Promise<GradeSubmissionResponseDto> {
    return this.resolveGradeSubmissionUseCase.execute(assessmentId, dto);
  }

  @Get('submissions/:submissionId')
  @RequiredPermissions('grades.submissions.view')
  getSubmission(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<GradeSubmissionResponseDto> {
    return this.getGradeSubmissionUseCase.execute(submissionId);
  }

  @Put('submissions/:submissionId/answers/:questionId')
  @RequiredPermissions('grades.submissions.submit')
  saveAnswer(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: SaveGradeSubmissionAnswerDto,
  ): Promise<GradeSubmissionAnswerResponseDto> {
    return this.saveGradeSubmissionAnswerUseCase.execute(
      submissionId,
      questionId,
      dto,
    );
  }

  @Put('submissions/:submissionId/answers')
  @RequiredPermissions('grades.submissions.submit')
  bulkSaveAnswers(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: BulkSaveGradeSubmissionAnswersDto,
  ): Promise<BulkSaveGradeSubmissionAnswersResponseDto> {
    return this.bulkSaveGradeSubmissionAnswersUseCase.execute(
      submissionId,
      dto,
    );
  }

  @Post('submissions/:submissionId/submit')
  @RequiredPermissions('grades.submissions.submit')
  submitSubmission(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<GradeSubmissionResponseDto> {
    return this.submitGradeSubmissionUseCase.execute(submissionId);
  }
}
