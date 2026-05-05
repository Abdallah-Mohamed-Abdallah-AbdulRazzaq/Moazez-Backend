import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherClassroomAssignmentUseCase } from '../application/get-teacher-classroom-assignment.use-case';
import { GetTeacherClassroomAssignmentSubmissionUseCase } from '../application/get-teacher-classroom-assignment-submission.use-case';
import { ListTeacherClassroomAssignmentSubmissionsUseCase } from '../application/list-teacher-classroom-assignment-submissions.use-case';
import { ListTeacherClassroomAssignmentsUseCase } from '../application/list-teacher-classroom-assignments.use-case';
import {
  ListTeacherClassroomAssignmentSubmissionsQueryDto,
  ListTeacherClassroomAssignmentsQueryDto,
  TeacherClassroomAssignmentDetailResponseDto,
  TeacherClassroomAssignmentParamsDto,
  TeacherClassroomAssignmentSubmissionDetailResponseDto,
  TeacherClassroomAssignmentSubmissionParamsDto,
  TeacherClassroomAssignmentSubmissionsListResponseDto,
  TeacherClassroomAssignmentsListResponseDto,
  TeacherClassroomGradesParamsDto,
} from '../dto/teacher-classroom-grades.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/classroom/:classId/assignments')
export class TeacherClassroomAssignmentsController {
  constructor(
    private readonly listAssignmentsUseCase: ListTeacherClassroomAssignmentsUseCase,
    private readonly getAssignmentUseCase: GetTeacherClassroomAssignmentUseCase,
    private readonly listAssignmentSubmissionsUseCase: ListTeacherClassroomAssignmentSubmissionsUseCase,
    private readonly getAssignmentSubmissionUseCase: GetTeacherClassroomAssignmentSubmissionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: TeacherClassroomAssignmentsListResponseDto })
  listAssignments(
    @Param() params: TeacherClassroomGradesParamsDto,
    @Query() query: ListTeacherClassroomAssignmentsQueryDto,
  ): Promise<TeacherClassroomAssignmentsListResponseDto> {
    return this.listAssignmentsUseCase.execute(params.classId, query);
  }

  @Get(':assignmentId')
  @ApiOkResponse({ type: TeacherClassroomAssignmentDetailResponseDto })
  getAssignment(
    @Param() params: TeacherClassroomAssignmentParamsDto,
  ): Promise<TeacherClassroomAssignmentDetailResponseDto> {
    return this.getAssignmentUseCase.execute(
      params.classId,
      params.assignmentId,
    );
  }

  @Get(':assignmentId/submissions')
  @ApiOkResponse({ type: TeacherClassroomAssignmentSubmissionsListResponseDto })
  listAssignmentSubmissions(
    @Param() params: TeacherClassroomAssignmentParamsDto,
    @Query() query: ListTeacherClassroomAssignmentSubmissionsQueryDto,
  ): Promise<TeacherClassroomAssignmentSubmissionsListResponseDto> {
    return this.listAssignmentSubmissionsUseCase.execute(
      params.classId,
      params.assignmentId,
      query,
    );
  }

  @Get(':assignmentId/submissions/:submissionId')
  @ApiOkResponse({
    type: TeacherClassroomAssignmentSubmissionDetailResponseDto,
  })
  getAssignmentSubmission(
    @Param() params: TeacherClassroomAssignmentSubmissionParamsDto,
  ): Promise<TeacherClassroomAssignmentSubmissionDetailResponseDto> {
    return this.getAssignmentSubmissionUseCase.execute(
      params.classId,
      params.assignmentId,
      params.submissionId,
    );
  }
}
