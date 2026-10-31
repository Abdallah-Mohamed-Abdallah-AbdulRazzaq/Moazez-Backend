import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { answerMediaSurfaceGuard } from '../../../../files/assessment-media/application/answer-media-surface.guard';
import { GRADE_TEACHER_AUTHORING_PERMISSION } from '../../../../grades/assessments/domain/grade-teacher-authoring';
import {
  BulkUpdateGradeAssessmentQuestionPointsDto,
  CreateGradeAssessmentQuestionDto,
  DeleteGradeAssessmentQuestionResponseDto,
  GradeAssessmentQuestionResponseDto,
  GradeAssessmentQuestionsListResponseDto,
  ReorderGradeAssessmentQuestionsDto,
} from '../../../../grades/assessments/dto/grade-assessment-question.dto';
import { TeacherGradeAuthoringService } from '../application/teacher-grade-authoring.service';
import { TeacherClassroomAssessmentParamsDto } from '../dto/teacher-classroom-grades.dto';
import {
  TeacherGradeAuthoringQuestionParamsDto,
  UpdateTeacherGradeQuestionDto,
} from '../dto/teacher-grade-authoring.dto';

@ApiTags('teacher-grade-authoring')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('TEACHER'))
@RequiredPermissions(GRADE_TEACHER_AUTHORING_PERMISSION)
@Controller(
  'teacher/classroom/:classId/grades/assessments/:assessmentId/authoring',
)
export class TeacherGradeAuthoringController {
  constructor(private readonly authoring: TeacherGradeAuthoringService) {}
  @Get('questions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeAssessmentQuestionsListResponseDto })
  list(@Param() p: TeacherClassroomAssessmentParamsDto) {
    return this.authoring.list(p.classId, p.assessmentId);
  }
  @Post('questions')
  @ApiCreatedResponse({ type: GradeAssessmentQuestionResponseDto })
  create(
    @Param() p: TeacherClassroomAssessmentParamsDto,
    @Body() command: CreateGradeAssessmentQuestionDto,
  ) {
    return this.authoring.create(p.classId, p.assessmentId, command);
  }
  @Put('questions/reorder')
  @ApiOkResponse({ type: GradeAssessmentQuestionsListResponseDto })
  reorder(
    @Param() p: TeacherClassroomAssessmentParamsDto,
    @Body() command: ReorderGradeAssessmentQuestionsDto,
  ) {
    return this.authoring.reorder(p.classId, p.assessmentId, command);
  }
  @Put('questions/points')
  @ApiOkResponse({ type: GradeAssessmentQuestionsListResponseDto })
  points(
    @Param() p: TeacherClassroomAssessmentParamsDto,
    @Body() command: BulkUpdateGradeAssessmentQuestionPointsDto,
  ) {
    return this.authoring.points(p.classId, p.assessmentId, command);
  }
  @Patch('questions/:questionId')
  @ApiOkResponse({ type: GradeAssessmentQuestionResponseDto })
  update(
    @Param() p: TeacherGradeAuthoringQuestionParamsDto,
    @Body() command: UpdateTeacherGradeQuestionDto,
  ) {
    return this.authoring.update(
      p.classId,
      p.assessmentId,
      p.questionId,
      command,
    );
  }
  @Delete('questions/:questionId')
  @ApiOkResponse({ type: DeleteGradeAssessmentQuestionResponseDto })
  remove(@Param() p: TeacherGradeAuthoringQuestionParamsDto) {
    return this.authoring.remove(p.classId, p.assessmentId, p.questionId);
  }
}
