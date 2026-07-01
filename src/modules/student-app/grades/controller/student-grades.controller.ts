import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetStudentAssessmentGradeUseCase } from '../application/get-student-assessment-grade.use-case';
import { GetStudentGradesSummaryUseCase } from '../application/get-student-grades-summary.use-case';
import { ListStudentGradesUseCase } from '../application/list-student-grades.use-case';
import {
  StudentAssessmentGradeDetailResponseDto,
  StudentGradesListResponseDto,
  StudentGradesQueryDto,
  StudentGradesSummaryResponseDto,
} from '../dto/student-grades.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/grades')
export class StudentGradesController {
  constructor(
    private readonly listStudentGradesUseCase: ListStudentGradesUseCase,
    private readonly getStudentGradesSummaryUseCase: GetStudentGradesSummaryUseCase,
    private readonly getStudentAssessmentGradeUseCase: GetStudentAssessmentGradeUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentGradesListResponseDto })
  @RequiredPermissions('grades.snapshots.view')
  listGrades(
    @Query() query: StudentGradesQueryDto,
  ): Promise<StudentGradesListResponseDto> {
    return this.listStudentGradesUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentGradesSummaryResponseDto })
  @RequiredPermissions('grades.snapshots.view')
  getSummary(
    @Query() query: StudentGradesQueryDto,
  ): Promise<StudentGradesSummaryResponseDto> {
    return this.getStudentGradesSummaryUseCase.execute(query);
  }

  @Get('assessments/:assessmentId')
  @ApiOkResponse({ type: StudentAssessmentGradeDetailResponseDto })
  @RequiredPermissions('grades.assessments.view')
  getAssessmentGrade(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<StudentAssessmentGradeDetailResponseDto> {
    return this.getStudentAssessmentGradeUseCase.execute(assessmentId);
  }
}
