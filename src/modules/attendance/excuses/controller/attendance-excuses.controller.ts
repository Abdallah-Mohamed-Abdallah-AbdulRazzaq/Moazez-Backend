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
import { ApproveAttendanceExcuseRequestUseCase } from '../application/approve-attendance-excuse-request.use-case';
import { CreateAttendanceExcuseRequestUseCase } from '../application/create-attendance-excuse-request.use-case';
import { DeleteAttendanceExcuseAttachmentUseCase } from '../application/delete-attendance-excuse-attachment.use-case';
import { DeleteAttendanceExcuseRequestUseCase } from '../application/delete-attendance-excuse-request.use-case';
import { GetAttendanceExcuseRequestUseCase } from '../application/get-attendance-excuse-request.use-case';
import { LinkAttendanceExcuseAttachmentsUseCase } from '../application/link-attendance-excuse-attachments.use-case';
import { ListAttendanceExcuseAttachmentsUseCase } from '../application/list-attendance-excuse-attachments.use-case';
import { ListAttendanceExcuseRequestsUseCase } from '../application/list-attendance-excuse-requests.use-case';
import { RejectAttendanceExcuseRequestUseCase } from '../application/reject-attendance-excuse-request.use-case';
import { UpdateAttendanceExcuseRequestUseCase } from '../application/update-attendance-excuse-request.use-case';
import {
  AttendanceExcuseAttachmentsListResponseDto,
  AttendanceExcuseRequestResponseDto,
  AttendanceExcuseRequestsListResponseDto,
  CreateAttendanceExcuseRequestDto,
  DeleteAttendanceExcuseRequestResponseDto,
  LinkAttendanceExcuseAttachmentsDto,
  ListAttendanceExcuseRequestsQueryDto,
  ReviewAttendanceExcuseRequestDto,
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
    private readonly listAttendanceExcuseAttachmentsUseCase: ListAttendanceExcuseAttachmentsUseCase,
    private readonly linkAttendanceExcuseAttachmentsUseCase: LinkAttendanceExcuseAttachmentsUseCase,
    private readonly deleteAttendanceExcuseAttachmentUseCase: DeleteAttendanceExcuseAttachmentUseCase,
    private readonly approveAttendanceExcuseRequestUseCase: ApproveAttendanceExcuseRequestUseCase,
    private readonly rejectAttendanceExcuseRequestUseCase: RejectAttendanceExcuseRequestUseCase,
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

  @Get(':id/attachments')
  @RequiredPermissions('attendance.excuses.view')
  listExcuseRequestAttachments(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendanceExcuseAttachmentsListResponseDto> {
    return this.listAttendanceExcuseAttachmentsUseCase.execute(id);
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

  @Post(':id/attachments')
  @RequiredPermissions('attendance.excuses.manage')
  linkExcuseRequestAttachments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkAttendanceExcuseAttachmentsDto,
  ): Promise<AttendanceExcuseAttachmentsListResponseDto> {
    return this.linkAttendanceExcuseAttachmentsUseCase.execute(id, dto);
  }

  @Post(':id/approve')
  @RequiredPermissions('attendance.excuses.review')
  approveExcuseRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewAttendanceExcuseRequestDto,
  ): Promise<AttendanceExcuseRequestResponseDto> {
    return this.approveAttendanceExcuseRequestUseCase.execute(id, dto);
  }

  @Post(':id/reject')
  @RequiredPermissions('attendance.excuses.review')
  rejectExcuseRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewAttendanceExcuseRequestDto,
  ): Promise<AttendanceExcuseRequestResponseDto> {
    return this.rejectAttendanceExcuseRequestUseCase.execute(id, dto);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequiredPermissions('attendance.excuses.manage')
  deleteExcuseRequestAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<DeleteAttendanceExcuseRequestResponseDto> {
    return this.deleteAttendanceExcuseAttachmentUseCase.execute(
      id,
      attachmentId,
    );
  }

  @Delete(':id')
  @RequiredPermissions('attendance.excuses.manage')
  deleteExcuseRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteAttendanceExcuseRequestResponseDto> {
    return this.deleteAttendanceExcuseRequestUseCase.execute(id);
  }
}
