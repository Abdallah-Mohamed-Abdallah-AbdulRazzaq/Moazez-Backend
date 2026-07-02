import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentAnnouncementUseCase } from '../application/get-parent-announcement.use-case';
import { ListParentAnnouncementAttachmentsUseCase } from '../application/list-parent-announcement-attachments.use-case';
import { ListParentAnnouncementsUseCase } from '../application/list-parent-announcements.use-case';
import { MarkParentAnnouncementReadUseCase } from '../application/mark-parent-announcement-read.use-case';
import {
  ParentAnnouncementAttachmentsResponseDto,
  ParentAnnouncementReadResponseDto,
  ParentAnnouncementResponseDto,
  ParentAnnouncementsListResponseDto,
  ParentAnnouncementsQueryDto,
} from '../dto/parent-announcements.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/announcements')
export class ParentAnnouncementsController {
  constructor(
    private readonly listParentAnnouncementsUseCase: ListParentAnnouncementsUseCase,
    private readonly getParentAnnouncementUseCase: GetParentAnnouncementUseCase,
    private readonly markParentAnnouncementReadUseCase: MarkParentAnnouncementReadUseCase,
    private readonly listParentAnnouncementAttachmentsUseCase: ListParentAnnouncementAttachmentsUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentAnnouncementsListResponseDto })
  @RequiredPermissions('communication.announcements.view')
  listAnnouncements(
    @Query() query: ParentAnnouncementsQueryDto,
  ): Promise<ParentAnnouncementsListResponseDto> {
    return this.listParentAnnouncementsUseCase.execute(query);
  }

  @Get(':announcementId')
  @ApiOkResponse({ type: ParentAnnouncementResponseDto })
  @RequiredPermissions('communication.announcements.view')
  getAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<ParentAnnouncementResponseDto> {
    return this.getParentAnnouncementUseCase.execute(announcementId);
  }

  @Post(':announcementId/read')
  @ApiCreatedResponse({ type: ParentAnnouncementReadResponseDto })
  @RequiredPermissions('communication.announcements.read')
  markRead(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<ParentAnnouncementReadResponseDto> {
    return this.markParentAnnouncementReadUseCase.execute(announcementId);
  }

  @Get(':announcementId/attachments')
  @ApiOkResponse({ type: ParentAnnouncementAttachmentsResponseDto })
  @RequiredPermissions('communication.announcements.view')
  listAttachments(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<ParentAnnouncementAttachmentsResponseDto> {
    return this.listParentAnnouncementAttachmentsUseCase.execute(
      announcementId,
    );
  }
}
