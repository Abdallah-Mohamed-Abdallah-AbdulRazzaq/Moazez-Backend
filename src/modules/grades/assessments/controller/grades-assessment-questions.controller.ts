import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { BulkUpdateGradeAssessmentQuestionPointsUseCase } from '../application/bulk-update-grade-assessment-question-points.use-case';
import { CreateGradeAssessmentQuestionUseCase } from '../application/create-grade-assessment-question.use-case';
import { DeleteGradeAssessmentQuestionUseCase } from '../application/delete-grade-assessment-question.use-case';
import { ListGradeAssessmentQuestionsUseCase } from '../application/list-grade-assessment-questions.use-case';
import { ReorderGradeAssessmentQuestionsUseCase } from '../application/reorder-grade-assessment-questions.use-case';
import { UpdateGradeAssessmentQuestionUseCase } from '../application/update-grade-assessment-question.use-case';
import {
  BulkUpdateGradeAssessmentQuestionPointsDto,
  CreateGradeAssessmentQuestionDto,
  DeleteGradeAssessmentQuestionResponseDto,
  GradeAssessmentQuestionResponseDto,
  GradeAssessmentQuestionsListResponseDto,
  ListGradeAssessmentQuestionsQueryDto,
  ReorderGradeAssessmentQuestionsDto,
  UpdateGradeAssessmentQuestionDto,
} from '../dto/grade-assessment-question.dto';

@ApiTags('grades-assessment-questions')
@ApiBearerAuth()
@Controller('grades')
export class GradesAssessmentQuestionsController {
  constructor(
    private readonly listQuestionsUseCase: ListGradeAssessmentQuestionsUseCase,
    private readonly createQuestionUseCase: CreateGradeAssessmentQuestionUseCase,
    private readonly updateQuestionUseCase: UpdateGradeAssessmentQuestionUseCase,
    private readonly deleteQuestionUseCase: DeleteGradeAssessmentQuestionUseCase,
    private readonly reorderQuestionsUseCase: ReorderGradeAssessmentQuestionsUseCase,
    private readonly bulkUpdatePointsUseCase: BulkUpdateGradeAssessmentQuestionPointsUseCase,
  ) {}

  @Get('assessments/:assessmentId/questions')
  @RequiredPermissions('grades.questions.view')
  listQuestions(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Query() query: ListGradeAssessmentQuestionsQueryDto,
  ): Promise<GradeAssessmentQuestionsListResponseDto> {
    return this.listQuestionsUseCase.execute(assessmentId, query);
  }

  @Post('assessments/:assessmentId/questions')
  @RequiredPermissions('grades.questions.manage')
  createQuestion(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: CreateGradeAssessmentQuestionDto,
  ): Promise<GradeAssessmentQuestionResponseDto> {
    return this.createQuestionUseCase.execute(assessmentId, dto);
  }

  @Post('assessments/:assessmentId/questions/reorder')
  @RequiredPermissions('grades.questions.manage')
  reorderQuestions(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: ReorderGradeAssessmentQuestionsDto,
  ): Promise<GradeAssessmentQuestionsListResponseDto> {
    return this.reorderQuestionsUseCase.execute(assessmentId, dto);
  }

  @Post('assessments/:assessmentId/questions/points/bulk')
  @RequiredPermissions('grades.questions.manage')
  bulkUpdateQuestionPoints(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: BulkUpdateGradeAssessmentQuestionPointsDto,
  ): Promise<GradeAssessmentQuestionsListResponseDto> {
    return this.bulkUpdatePointsUseCase.execute(assessmentId, dto);
  }

  @Patch('questions/:questionId')
  @RequiredPermissions('grades.questions.manage')
  updateQuestion(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: UpdateGradeAssessmentQuestionDto,
  ): Promise<GradeAssessmentQuestionResponseDto> {
    return this.updateQuestionUseCase.execute(questionId, dto);
  }

  @Delete('questions/:questionId')
  @RequiredPermissions('grades.questions.manage')
  deleteQuestion(
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<DeleteGradeAssessmentQuestionResponseDto> {
    return this.deleteQuestionUseCase.execute(questionId);
  }
}
