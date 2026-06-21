import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { ReplayCommunicationAnnouncementNotificationsUseCase } from '../application/communication-announcement.use-cases';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication/admin')
export class CommunicationAdminController {
  constructor(
    private readonly replayCommunicationAnnouncementNotificationsUseCase: ReplayCommunicationAnnouncementNotificationsUseCase,
  ) {}

  @Post('announcements/:announcementId/replay-notifications')
  @RequiredPermissions(
    'communication.admin.view',
    'communication.notifications.manage',
  )
  replayAnnouncementNotifications(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ) {
    return this.replayCommunicationAnnouncementNotificationsUseCase.execute(
      announcementId,
    );
  }
}
