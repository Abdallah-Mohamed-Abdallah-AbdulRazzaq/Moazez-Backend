import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherClassroomUseCase } from '../application/get-teacher-classroom.use-case';
import { ListTeacherClassroomRosterUseCase } from '../application/list-teacher-classroom-roster.use-case';
import {
  ListTeacherClassroomRosterQueryDto,
  TeacherClassroomDetailResponseDto,
  TeacherClassroomParamsDto,
  TeacherClassroomRosterResponseDto,
} from '../dto/teacher-classroom.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/classroom')
export class TeacherClassroomController {
  constructor(
    private readonly getTeacherClassroomUseCase: GetTeacherClassroomUseCase,
    private readonly listTeacherClassroomRosterUseCase: ListTeacherClassroomRosterUseCase,
  ) {}

  @Get(':classId')
  @ApiOkResponse({ type: TeacherClassroomDetailResponseDto })
  getClassroom(
    @Param() params: TeacherClassroomParamsDto,
  ): Promise<TeacherClassroomDetailResponseDto> {
    return this.getTeacherClassroomUseCase.execute(params.classId);
  }

  @Get(':classId/roster')
  @ApiOkResponse({ type: TeacherClassroomRosterResponseDto })
  listRoster(
    @Param() params: TeacherClassroomParamsDto,
    @Query() query: ListTeacherClassroomRosterQueryDto,
  ): Promise<TeacherClassroomRosterResponseDto> {
    return this.listTeacherClassroomRosterUseCase.execute(
      params.classId,
      query,
    );
  }
}
