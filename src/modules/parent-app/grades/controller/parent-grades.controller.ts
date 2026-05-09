import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetParentChildAssessmentGradeUseCase } from '../application/get-parent-child-assessment-grade.use-case';
import { GetParentChildGradesSummaryUseCase } from '../application/get-parent-child-grades-summary.use-case';
import { ListParentChildGradesUseCase } from '../application/list-parent-child-grades.use-case';
import {
  ParentAssessmentGradeDetailResponseDto,
  ParentGradesListResponseDto,
  ParentGradesQueryDto,
  ParentGradesSummaryResponseDto,
} from '../dto/parent-grades.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/grades')
export class ParentGradesController {
  constructor(
    private readonly listParentChildGradesUseCase: ListParentChildGradesUseCase,
    private readonly getParentChildGradesSummaryUseCase: GetParentChildGradesSummaryUseCase,
    private readonly getParentChildAssessmentGradeUseCase: GetParentChildAssessmentGradeUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentGradesListResponseDto })
  listGrades(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentGradesQueryDto,
  ): Promise<ParentGradesListResponseDto> {
    return this.listParentChildGradesUseCase.execute(studentId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: ParentGradesSummaryResponseDto })
  getSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentGradesQueryDto,
  ): Promise<ParentGradesSummaryResponseDto> {
    return this.getParentChildGradesSummaryUseCase.execute(studentId, query);
  }

  @Get('assessments/:assessmentId')
  @ApiOkResponse({ type: ParentAssessmentGradeDetailResponseDto })
  getAssessmentGrade(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<ParentAssessmentGradeDetailResponseDto> {
    return this.getParentChildAssessmentGradeUseCase.execute(
      studentId,
      assessmentId,
    );
  }
}
