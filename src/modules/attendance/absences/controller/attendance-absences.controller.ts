import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetAttendanceAbsenceSummaryUseCase } from '../application/get-attendance-absence-summary.use-case';
import { ListAttendanceAbsencesUseCase } from '../application/list-attendance-absences.use-case';
import {
  AttendanceAbsencesListResponseDto,
  AttendanceAbsenceSummaryQueryDto,
  AttendanceAbsenceSummaryResponseDto,
  ListAttendanceAbsencesQueryDto,
} from '../dto/attendance-absences.dto';

@ApiTags('attendance-absences')
@ApiBearerAuth()
@Controller('attendance/absences')
export class AttendanceAbsencesController {
  constructor(
    private readonly listAttendanceAbsencesUseCase: ListAttendanceAbsencesUseCase,
    private readonly getAttendanceAbsenceSummaryUseCase: GetAttendanceAbsenceSummaryUseCase,
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
}
