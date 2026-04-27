import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateAttendanceExcuseRequestUseCase } from '../application/create-attendance-excuse-request.use-case';
import { DeleteAttendanceExcuseRequestUseCase } from '../application/delete-attendance-excuse-request.use-case';
import { GetAttendanceExcuseRequestUseCase } from '../application/get-attendance-excuse-request.use-case';
import { ListAttendanceExcuseRequestsUseCase } from '../application/list-attendance-excuse-requests.use-case';
import { UpdateAttendanceExcuseRequestUseCase } from '../application/update-attendance-excuse-request.use-case';
import {
  AttendanceExcuseRequestResponseDto,
  AttendanceExcuseRequestsListResponseDto,
  CreateAttendanceExcuseRequestDto,
  DeleteAttendanceExcuseRequestResponseDto,
  ListAttendanceExcuseRequestsQueryDto,
  UpdateAttendanceExcuseRequestDto,
} from '../dto/attendance-excuse.dto';

@ApiTags('attendance-excuses')
@ApiBearerAuth()
@Controller('attendance/excuse-requests')
export class AttendanceExcusesController {
  constructor(
    private readonly listAttendanceExcuseRequestsUseCase: ListAttendanceExcuseRequestsUseCase,
    private readonly getAttendanceExcuseRequestUseCase: GetAttendanceExcuseRequestUseCase,
    private readonly createAttendanceExcuseRequestUseCase: CreateAttendanceExcuseRequestUseCase,
    private readonly updateAttendanceExcuseRequestUseCase: UpdateAttendanceExcuseRequestUseCase,
    private readonly deleteAttendanceExcuseRequestUseCase: DeleteAttendanceExcuseRequestUseCase,
  ) {}

  @Get()
  @RequiredPermissions('attendance.excuses.view')
  listExcuseRequests(
    @Query() query: ListAttendanceExcuseRequestsQueryDto,
  ): Promise<AttendanceExcuseRequestsListResponseDto> {
    return this.listAttendanceExcuseRequestsUseCase.execute(query);
  }

  @Get(':id')
  @RequiredPermissions('attendance.excuses.view')
  getExcuseRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendanceExcuseRequestResponseDto> {
    return this.getAttendanceExcuseRequestUseCase.execute(id);
  }

  @Post()
  @RequiredPermissions('attendance.excuses.manage')
  createExcuseRequest(
    @Body() dto: CreateAttendanceExcuseRequestDto,
  ): Promise<AttendanceExcuseRequestResponseDto> {
    return this.createAttendanceExcuseRequestUseCase.execute(dto);
  }

  @Patch(':id')
  @RequiredPermissions('attendance.excuses.manage')
  updateExcuseRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAttendanceExcuseRequestDto,
  ): Promise<AttendanceExcuseRequestResponseDto> {
    return this.updateAttendanceExcuseRequestUseCase.execute(id, dto);
  }

  @Delete(':id')
  @RequiredPermissions('attendance.excuses.manage')
  deleteExcuseRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteAttendanceExcuseRequestResponseDto> {
    return this.deleteAttendanceExcuseRequestUseCase.execute(id);
  }
}
