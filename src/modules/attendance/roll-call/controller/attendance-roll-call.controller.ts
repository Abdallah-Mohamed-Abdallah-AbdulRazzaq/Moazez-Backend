import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CorrectAttendanceEntryUseCase } from '../application/correct-attendance-entry.use-case';
import { GetRollCallRosterUseCase } from '../application/get-roll-call-roster.use-case';
import { GetRollCallSessionDetailUseCase } from '../application/get-roll-call-session-detail.use-case';
import { ListRollCallSessionsUseCase } from '../application/list-roll-call-sessions.use-case';
import { ResolveRollCallSessionUseCase } from '../application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from '../application/save-roll-call-entries.use-case';
import { SubmitRollCallSessionUseCase } from '../application/submit-roll-call-session.use-case';
import { UnsubmitRollCallSessionUseCase } from '../application/unsubmit-roll-call-session.use-case';
import { UpsertRollCallEntryUseCase } from '../application/upsert-roll-call-entry.use-case';
import {
  AttendanceRollCallEntryResponseDto,
  CorrectAttendanceEntryDto,
  ListRollCallSessionsQueryDto,
  ResolveRollCallSessionDto,
  RollCallRosterQueryDto,
  RollCallRosterResponseDto,
  RollCallSessionResponseDto,
  RollCallSessionsListResponseDto,
  SaveRollCallEntriesDto,
  SaveRollCallEntriesResponseDto,
  UpsertRollCallEntryDto,
} from '../dto/attendance-roll-call.dto';

@ApiTags('attendance-roll-call')
@ApiBearerAuth()
@Controller('attendance/roll-call')
export class AttendanceRollCallController {
  constructor(
    private readonly getRollCallRosterUseCase: GetRollCallRosterUseCase,
    private readonly resolveRollCallSessionUseCase: ResolveRollCallSessionUseCase,
    private readonly listRollCallSessionsUseCase: ListRollCallSessionsUseCase,
    private readonly getRollCallSessionDetailUseCase: GetRollCallSessionDetailUseCase,
    private readonly saveRollCallEntriesUseCase: SaveRollCallEntriesUseCase,
    private readonly upsertRollCallEntryUseCase: UpsertRollCallEntryUseCase,
    private readonly submitRollCallSessionUseCase: SubmitRollCallSessionUseCase,
    private readonly unsubmitRollCallSessionUseCase: UnsubmitRollCallSessionUseCase,
    private readonly correctAttendanceEntryUseCase: CorrectAttendanceEntryUseCase,
  ) {}

  @Get('roster')
  @RequiredPermissions('attendance.sessions.view')
  getRoster(
    @Query() query: RollCallRosterQueryDto,
  ): Promise<RollCallRosterResponseDto> {
    return this.getRollCallRosterUseCase.execute(query);
  }

  @Post('session/resolve')
  @RequiredPermissions('attendance.sessions.manage')
  resolveSession(
    @Body() dto: ResolveRollCallSessionDto,
  ): Promise<RollCallSessionResponseDto> {
    return this.resolveRollCallSessionUseCase.execute(dto);
  }

  @Get('sessions')
  @RequiredPermissions('attendance.sessions.view')
  listSessions(
    @Query() query: ListRollCallSessionsQueryDto,
  ): Promise<RollCallSessionsListResponseDto> {
    return this.listRollCallSessionsUseCase.execute(query);
  }

  @Get('sessions/:id')
  @RequiredPermissions('attendance.sessions.view')
  getSessionDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RollCallSessionResponseDto> {
    return this.getRollCallSessionDetailUseCase.execute(id);
  }

  @Post('sessions/:id/submit')
  @RequiredPermissions('attendance.sessions.submit')
  submitSession(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RollCallSessionResponseDto> {
    return this.submitRollCallSessionUseCase.execute(id);
  }

  @Post('sessions/:id/unsubmit')
  @RequiredPermissions('attendance.sessions.submit')
  unsubmitSession(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RollCallSessionResponseDto> {
    return this.unsubmitRollCallSessionUseCase.execute(id);
  }

  @Put('sessions/:id/entries')
  @RequiredPermissions('attendance.entries.manage')
  saveEntries(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveRollCallEntriesDto,
  ): Promise<SaveRollCallEntriesResponseDto> {
    return this.saveRollCallEntriesUseCase.execute(id, dto);
  }

  @Put('sessions/:id/entries/:studentId')
  @RequiredPermissions('attendance.entries.manage')
  upsertEntry(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpsertRollCallEntryDto,
  ): Promise<AttendanceRollCallEntryResponseDto> {
    return this.upsertRollCallEntryUseCase.execute(id, studentId, dto);
  }

  @Post('sessions/:sessionId/entries/:studentId/correct')
  @RequiredPermissions('attendance.entries.manage')
  correctEntry(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: CorrectAttendanceEntryDto,
  ): Promise<AttendanceRollCallEntryResponseDto> {
    return this.correctAttendanceEntryUseCase.execute(sessionId, studentId, dto);
  }
}
