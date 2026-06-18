import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CorrectAttendanceAbsenceEarlyLeaveUseCase } from '../application/correct-attendance-absence-early-leave.use-case';
import { GetAttendanceAbsenceSummaryUseCase } from '../application/get-attendance-absence-summary.use-case';
import { ListAttendanceAbsencesUseCase } from '../application/list-attendance-absences.use-case';
import { MarkAttendanceAbsenceExcusedUseCase } from '../application/mark-attendance-absence-excused.use-case';
import {
  AttendanceAbsenceIncidentResponseDto,
  AttendanceAbsencesListResponseDto,
  AttendanceAbsenceSummaryQueryDto,
  AttendanceAbsenceSummaryResponseDto,
  CorrectAttendanceAbsenceEarlyLeaveDto,
  ListAttendanceAbsencesQueryDto,
  MarkAttendanceAbsenceExcusedDto,
} from '../dto/attendance-absences.dto';

@ApiTags('attendance-absences')
@ApiBearerAuth()
@Controller('attendance/absences')
export class AttendanceAbsencesController {
  constructor(
    private readonly listAttendanceAbsencesUseCase: ListAttendanceAbsencesUseCase,
    private readonly getAttendanceAbsenceSummaryUseCase: GetAttendanceAbsenceSummaryUseCase,
    private readonly markAttendanceAbsenceExcusedUseCase: MarkAttendanceAbsenceExcusedUseCase,
    private readonly correctAttendanceAbsenceEarlyLeaveUseCase: CorrectAttendanceAbsenceEarlyLeaveUseCase,
  ) {}

  @Get()
  @RequiredPermissions('attendance.absences.view')
  listAbsences(
    @Query() query: ListAttendanceAbsencesQueryDto,
  ): Promise<AttendanceAbsencesListResponseDto> {
    return this.listAttendanceAbsencesUseCase.execute(query);
  }

  @Get('summary')
  @RequiredPermissions('attendance.absences.view')
  getSummary(
    @Query() query: AttendanceAbsenceSummaryQueryDto,
  ): Promise<AttendanceAbsenceSummaryResponseDto> {
    return this.getAttendanceAbsenceSummaryUseCase.execute(query);
  }

  @Patch(':id/excuse')
  @RequiredPermissions('attendance.entries.manage')
  markExcused(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkAttendanceAbsenceExcusedDto,
  ): Promise<AttendanceAbsenceIncidentResponseDto> {
    return this.markAttendanceAbsenceExcusedUseCase.execute(id, dto);
  }

  @Patch(':id/early-leave')
  @RequiredPermissions('attendance.entries.manage')
  correctEarlyLeave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CorrectAttendanceAbsenceEarlyLeaveDto,
  ): Promise<AttendanceAbsenceIncidentResponseDto> {
    return this.correctAttendanceAbsenceEarlyLeaveUseCase.execute(id, dto);
  }
}
