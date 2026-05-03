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
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  ArchiveCommunicationAnnouncementUseCase,
  CancelCommunicationAnnouncementUseCase,
  CreateCommunicationAnnouncementUseCase,
  DeleteCommunicationAnnouncementAttachmentUseCase,
  GetCommunicationAnnouncementReadSummaryUseCase,
  GetCommunicationAnnouncementUseCase,
  LinkCommunicationAnnouncementAttachmentUseCase,
  ListCommunicationAnnouncementAttachmentsUseCase,
  ListCommunicationAnnouncementsUseCase,
  MarkCommunicationAnnouncementReadUseCase,
  PublishCommunicationAnnouncementUseCase,
  UpdateCommunicationAnnouncementUseCase,
} from '../application/communication-announcement.use-cases';
import {
  CreateCommunicationAnnouncementDto,
  LinkCommunicationAnnouncementAttachmentDto,
  ListCommunicationAnnouncementsQueryDto,
  UpdateCommunicationAnnouncementDto,
} from '../dto/communication-announcement.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication/announcements')
export class CommunicationAnnouncementController {
  constructor(
    private readonly listCommunicationAnnouncementsUseCase: ListCommunicationAnnouncementsUseCase,
    private readonly createCommunicationAnnouncementUseCase: CreateCommunicationAnnouncementUseCase,
    private readonly getCommunicationAnnouncementUseCase: GetCommunicationAnnouncementUseCase,
    private readonly updateCommunicationAnnouncementUseCase: UpdateCommunicationAnnouncementUseCase,
    private readonly publishCommunicationAnnouncementUseCase: PublishCommunicationAnnouncementUseCase,
    private readonly archiveCommunicationAnnouncementUseCase: ArchiveCommunicationAnnouncementUseCase,
    private readonly cancelCommunicationAnnouncementUseCase: CancelCommunicationAnnouncementUseCase,
    private readonly markCommunicationAnnouncementReadUseCase: MarkCommunicationAnnouncementReadUseCase,
    private readonly getCommunicationAnnouncementReadSummaryUseCase: GetCommunicationAnnouncementReadSummaryUseCase,
    private readonly listCommunicationAnnouncementAttachmentsUseCase: ListCommunicationAnnouncementAttachmentsUseCase,
    private readonly linkCommunicationAnnouncementAttachmentUseCase: LinkCommunicationAnnouncementAttachmentUseCase,
    private readonly deleteCommunicationAnnouncementAttachmentUseCase: DeleteCommunicationAnnouncementAttachmentUseCase,
  ) {}

  @Get()
  @RequiredPermissions('communication.announcements.view')
  listAnnouncements(@Query() query: ListCommunicationAnnouncementsQueryDto) {
    return this.listCommunicationAnnouncementsUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('communication.announcements.manage')
  createAnnouncement(@Body() dto: CreateCommunicationAnnouncementDto) {
    return this.createCommunicationAnnouncementUseCase.execute(dto);
  }

  @Get(':announcementId')
  @RequiredPermissions('communication.announcements.view')
  getAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.getCommunicationAnnouncementUseCase.execute(announcementId);
  }

  @Patch(':announcementId')
  @RequiredPermissions('communication.announcements.manage')
  updateAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Body() dto: UpdateCommunicationAnnouncementDto,
  ) {
    return this.updateCommunicationAnnouncementUseCase.execute(
      announcementId,
      dto,
    );
  }

  @Post(':announcementId/publish')
  @RequiredPermissions('communication.announcements.manage')
  publishAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.publishCommunicationAnnouncementUseCase.execute(announcementId);
  }

  @Post(':announcementId/archive')
  @RequiredPermissions('communication.announcements.manage')
  archiveAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.archiveCommunicationAnnouncementUseCase.execute(announcementId);
  }

  @Post(':announcementId/cancel')
  @RequiredPermissions('communication.announcements.manage')
  cancelAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.cancelCommunicationAnnouncementUseCase.execute(announcementId);
  }

  @Post(':announcementId/read')
  @RequiredPermissions('communication.announcements.view')
  markAnnouncementRead(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.markCommunicationAnnouncementReadUseCase.execute(
      announcementId,
    );
  }

  @Get(':announcementId/read-summary')
  @RequiredPermissions('communication.announcements.manage')
  getReadSummary(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.getCommunicationAnnouncementReadSummaryUseCase.execute(
      announcementId,
    );
  }

  @Get(':announcementId/attachments')
  @RequiredPermissions('communication.announcements.view')
  listAttachments(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.listCommunicationAnnouncementAttachmentsUseCase.execute(
      announcementId,
    );
  }

  @Post(':announcementId/attachments')
  @RequiredPermissions('communication.announcements.manage')
  linkAttachment(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Body() dto: LinkCommunicationAnnouncementAttachmentDto,
  ) {
    return this.linkCommunicationAnnouncementAttachmentUseCase.execute(
      announcementId,
      dto,
    );
  }

  @Delete(':announcementId/attachments/:attachmentId')
  @RequiredPermissions('communication.announcements.manage')
  deleteAttachment(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.deleteCommunicationAnnouncementAttachmentUseCase.execute(
      announcementId,
      attachmentId,
    );
  }
}
