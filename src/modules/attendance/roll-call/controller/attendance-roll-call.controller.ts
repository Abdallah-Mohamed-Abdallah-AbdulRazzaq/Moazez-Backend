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
import { GetRollCallRosterUseCase } from '../application/get-roll-call-roster.use-case';
import { GetRollCallSessionDetailUseCase } from '../application/get-roll-call-session-detail.use-case';
import { ListRollCallSessionsUseCase } from '../application/list-roll-call-sessions.use-case';
import { ResolveRollCallSessionUseCase } from '../application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from '../application/save-roll-call-entries.use-case';
import { UpsertRollCallEntryUseCase } from '../application/upsert-roll-call-entry.use-case';
import {
  AttendanceRollCallEntryResponseDto,
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
}
