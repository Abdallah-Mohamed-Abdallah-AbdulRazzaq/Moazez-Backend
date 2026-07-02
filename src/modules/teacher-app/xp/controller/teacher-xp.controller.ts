import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherClassXpUseCase } from '../application/get-teacher-class-xp.use-case';
import { GetTeacherStudentXpUseCase } from '../application/get-teacher-student-xp.use-case';
import { GetTeacherXpDashboardUseCase } from '../application/get-teacher-xp-dashboard.use-case';
import { ListTeacherStudentXpHistoryUseCase } from '../application/list-teacher-student-xp-history.use-case';
import {
  TeacherXpClassParamsDto,
  TeacherXpClassResponseDto,
  TeacherXpDashboardResponseDto,
  TeacherXpHistoryQueryDto,
  TeacherXpHistoryResponseDto,
  TeacherXpStudentParamsDto,
  TeacherXpStudentResponseDto,
} from '../dto/teacher-xp.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/xp')
export class TeacherXpController {
  constructor(
    private readonly getTeacherXpDashboardUseCase: GetTeacherXpDashboardUseCase,
    private readonly getTeacherClassXpUseCase: GetTeacherClassXpUseCase,
    private readonly getTeacherStudentXpUseCase: GetTeacherStudentXpUseCase,
    private readonly listTeacherStudentXpHistoryUseCase: ListTeacherStudentXpHistoryUseCase,
  ) {}

  @Get('dashboard')
  @RequiredPermissions('reinforcement.xp.view')
  @ApiOkResponse({ type: TeacherXpDashboardResponseDto })
  getDashboard(): Promise<TeacherXpDashboardResponseDto> {
    return this.getTeacherXpDashboardUseCase.execute();
  }

  @Get('classes/:classId')
  @RequiredPermissions('reinforcement.xp.view')
  @ApiOkResponse({ type: TeacherXpClassResponseDto })
  getClassXp(
    @Param() params: TeacherXpClassParamsDto,
  ): Promise<TeacherXpClassResponseDto> {
    return this.getTeacherClassXpUseCase.execute(params.classId);
  }

  @Get('students/:studentId')
  @RequiredPermissions('reinforcement.xp.view', 'students.records.view')
  @ApiOkResponse({ type: TeacherXpStudentResponseDto })
  getStudentXp(
    @Param() params: TeacherXpStudentParamsDto,
  ): Promise<TeacherXpStudentResponseDto> {
    return this.getTeacherStudentXpUseCase.execute(params.studentId);
  }

  @Get('students/:studentId/history')
  @RequiredPermissions('reinforcement.xp.view', 'students.records.view')
  @ApiOkResponse({ type: TeacherXpHistoryResponseDto })
  listStudentXpHistory(
    @Param() params: TeacherXpStudentParamsDto,
    @Query() query: TeacherXpHistoryQueryDto,
  ): Promise<TeacherXpHistoryResponseDto> {
    return this.listTeacherStudentXpHistoryUseCase.execute(
      params.studentId,
      query,
    );
  }
}
