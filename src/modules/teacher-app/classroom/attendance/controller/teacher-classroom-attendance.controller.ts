import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherClassroomAttendanceRosterUseCase } from '../application/get-teacher-classroom-attendance-roster.use-case';
import { GetTeacherClassroomAttendanceSessionUseCase } from '../application/get-teacher-classroom-attendance-session.use-case';
import { ResolveTeacherClassroomAttendanceSessionUseCase } from '../application/resolve-teacher-classroom-attendance-session.use-case';
import { SubmitTeacherClassroomAttendanceSessionUseCase } from '../application/submit-teacher-classroom-attendance-session.use-case';
import { UpdateTeacherClassroomAttendanceEntriesUseCase } from '../application/update-teacher-classroom-attendance-entries.use-case';
import {
  GetTeacherClassroomAttendanceRosterQueryDto,
  ResolveTeacherClassroomAttendanceSessionDto,
  TeacherClassroomAttendanceParamsDto,
  TeacherClassroomAttendanceRosterResponseDto,
  TeacherClassroomAttendanceSessionParamsDto,
  TeacherClassroomAttendanceSessionResponseDto,
  UpdateTeacherClassroomAttendanceEntriesDto,
} from '../dto/teacher-classroom-attendance.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/classroom/:classId/attendance')
export class TeacherClassroomAttendanceController {
  constructor(
    private readonly getRosterUseCase: GetTeacherClassroomAttendanceRosterUseCase,
    private readonly resolveSessionUseCase: ResolveTeacherClassroomAttendanceSessionUseCase,
    private readonly getSessionUseCase: GetTeacherClassroomAttendanceSessionUseCase,
    private readonly updateEntriesUseCase: UpdateTeacherClassroomAttendanceEntriesUseCase,
    private readonly submitSessionUseCase: SubmitTeacherClassroomAttendanceSessionUseCase,
  ) {}

  @Get('roster')
  @ApiOkResponse({ type: TeacherClassroomAttendanceRosterResponseDto })
  getRoster(
    @Param() params: TeacherClassroomAttendanceParamsDto,
    @Query() query: GetTeacherClassroomAttendanceRosterQueryDto,
  ): Promise<TeacherClassroomAttendanceRosterResponseDto> {
    return this.getRosterUseCase.execute(params.classId, query);
  }

  @Post('session/resolve')
  @ApiOkResponse({ type: TeacherClassroomAttendanceSessionResponseDto })
  resolveSession(
    @Param() params: TeacherClassroomAttendanceParamsDto,
    @Body() body: ResolveTeacherClassroomAttendanceSessionDto,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    return this.resolveSessionUseCase.execute(params.classId, body);
  }

  @Get('sessions/:sessionId')
  @ApiOkResponse({ type: TeacherClassroomAttendanceSessionResponseDto })
  getSession(
    @Param() params: TeacherClassroomAttendanceSessionParamsDto,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    return this.getSessionUseCase.execute(params.classId, params.sessionId);
  }

  @Put('sessions/:sessionId/entries')
  @ApiOkResponse({ type: TeacherClassroomAttendanceSessionResponseDto })
  updateEntries(
    @Param() params: TeacherClassroomAttendanceSessionParamsDto,
    @Body() body: UpdateTeacherClassroomAttendanceEntriesDto,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    return this.updateEntriesUseCase.execute(
      params.classId,
      params.sessionId,
      body,
    );
  }

  @Post('sessions/:sessionId/submit')
  @ApiOkResponse({ type: TeacherClassroomAttendanceSessionResponseDto })
  submitSession(
    @Param() params: TeacherClassroomAttendanceSessionParamsDto,
  ): Promise<TeacherClassroomAttendanceSessionResponseDto> {
    return this.submitSessionUseCase.execute(params.classId, params.sessionId);
  }
}
