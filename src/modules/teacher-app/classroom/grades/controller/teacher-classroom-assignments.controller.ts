import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ListTeacherClassroomAssignmentsUseCase } from '../application/list-teacher-classroom-assignments.use-case';
import {
  ListTeacherClassroomAssignmentsQueryDto,
  TeacherClassroomAssignmentsListResponseDto,
  TeacherClassroomGradesParamsDto,
} from '../dto/teacher-classroom-grades.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/classroom/:classId/assignments')
export class TeacherClassroomAssignmentsController {
  constructor(
    private readonly listAssignmentsUseCase: ListTeacherClassroomAssignmentsUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: TeacherClassroomAssignmentsListResponseDto })
  listAssignments(
    @Param() params: TeacherClassroomGradesParamsDto,
    @Query() query: ListTeacherClassroomAssignmentsQueryDto,
  ): Promise<TeacherClassroomAssignmentsListResponseDto> {
    return this.listAssignmentsUseCase.execute(params.classId, query);
  }
}
