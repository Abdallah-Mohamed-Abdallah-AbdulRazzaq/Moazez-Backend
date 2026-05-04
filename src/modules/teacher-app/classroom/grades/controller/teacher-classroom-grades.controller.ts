import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherClassroomAssessmentUseCase } from '../application/get-teacher-classroom-assessment.use-case';
import { GetTeacherClassroomGradebookUseCase } from '../application/get-teacher-classroom-gradebook.use-case';
import { ListTeacherClassroomAssessmentsUseCase } from '../application/list-teacher-classroom-assessments.use-case';
import {
  GetTeacherClassroomGradebookQueryDto,
  ListTeacherClassroomAssessmentsQueryDto,
  TeacherClassroomAssessmentDetailResponseDto,
  TeacherClassroomAssessmentParamsDto,
  TeacherClassroomAssessmentsListResponseDto,
  TeacherClassroomGradebookResponseDto,
  TeacherClassroomGradesParamsDto,
} from '../dto/teacher-classroom-grades.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/classroom/:classId/grades')
export class TeacherClassroomGradesController {
  constructor(
    private readonly listAssessmentsUseCase: ListTeacherClassroomAssessmentsUseCase,
    private readonly getAssessmentUseCase: GetTeacherClassroomAssessmentUseCase,
    private readonly getGradebookUseCase: GetTeacherClassroomGradebookUseCase,
  ) {}

  @Get('assessments')
  @ApiOkResponse({ type: TeacherClassroomAssessmentsListResponseDto })
  listAssessments(
    @Param() params: TeacherClassroomGradesParamsDto,
    @Query() query: ListTeacherClassroomAssessmentsQueryDto,
  ): Promise<TeacherClassroomAssessmentsListResponseDto> {
    return this.listAssessmentsUseCase.execute(params.classId, query);
  }

  @Get('assessments/:assessmentId')
  @ApiOkResponse({ type: TeacherClassroomAssessmentDetailResponseDto })
  getAssessment(
    @Param() params: TeacherClassroomAssessmentParamsDto,
  ): Promise<TeacherClassroomAssessmentDetailResponseDto> {
    return this.getAssessmentUseCase.execute(
      params.classId,
      params.assessmentId,
    );
  }

  @Get('gradebook')
  @ApiOkResponse({ type: TeacherClassroomGradebookResponseDto })
  getGradebook(
    @Param() params: TeacherClassroomGradesParamsDto,
    @Query() query: GetTeacherClassroomGradebookQueryDto,
  ): Promise<TeacherClassroomGradebookResponseDto> {
    return this.getGradebookUseCase.execute(params.classId, query);
  }
}
