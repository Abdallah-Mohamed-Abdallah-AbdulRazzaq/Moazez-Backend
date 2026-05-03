import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  ArchiveCommunicationNotificationUseCase,
  GetCommunicationNotificationDeliveryUseCase,
  GetCommunicationNotificationUseCase,
  ListCommunicationNotificationDeliveriesUseCase,
  ListCommunicationNotificationsUseCase,
  MarkAllCommunicationNotificationsReadUseCase,
  MarkCommunicationNotificationReadUseCase,
} from '../application/communication-notification.use-cases';
import {
  ListCommunicationNotificationDeliveriesQueryDto,
  ListCommunicationNotificationsQueryDto,
} from '../dto/communication-notification.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
export class CommunicationNotificationController {
  constructor(
    private readonly listCommunicationNotificationsUseCase: ListCommunicationNotificationsUseCase,
    private readonly getCommunicationNotificationUseCase: GetCommunicationNotificationUseCase,
    private readonly markCommunicationNotificationReadUseCase: MarkCommunicationNotificationReadUseCase,
    private readonly markAllCommunicationNotificationsReadUseCase: MarkAllCommunicationNotificationsReadUseCase,
    private readonly archiveCommunicationNotificationUseCase: ArchiveCommunicationNotificationUseCase,
    private readonly listCommunicationNotificationDeliveriesUseCase: ListCommunicationNotificationDeliveriesUseCase,
    private readonly getCommunicationNotificationDeliveryUseCase: GetCommunicationNotificationDeliveryUseCase,
  ) {}

  @Get('notifications')
  @RequiredPermissions('communication.notifications.view')
  listNotifications(@Query() query: ListCommunicationNotificationsQueryDto) {
    return this.listCommunicationNotificationsUseCase.execute(query);
  }

  @Post('notifications/read-all')
  @RequiredPermissions('communication.notifications.view')
  markAllNotificationsRead() {
    return this.markAllCommunicationNotificationsReadUseCase.execute();
  }

  @Get('notifications/:notificationId')
  @RequiredPermissions('communication.notifications.view')
  getNotification(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ) {
    return this.getCommunicationNotificationUseCase.execute(notificationId);
  }

  @Post('notifications/:notificationId/read')
  @RequiredPermissions('communication.notifications.view')
  markNotificationRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ) {
    return this.markCommunicationNotificationReadUseCase.execute(
      notificationId,
    );
  }

  @Post('notifications/:notificationId/archive')
  @RequiredPermissions('communication.notifications.view')
  archiveNotification(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ) {
    return this.archiveCommunicationNotificationUseCase.execute(notificationId);
  }

  @Get('notification-deliveries')
  @RequiredPermissions('communication.notifications.manage')
  listNotificationDeliveries(
    @Query() query: ListCommunicationNotificationDeliveriesQueryDto,
  ) {
    return this.listCommunicationNotificationDeliveriesUseCase.execute(query);
  }

  @Get('notification-deliveries/:deliveryId')
  @RequiredPermissions('communication.notifications.manage')
  getNotificationDelivery(
    @Param('deliveryId', new ParseUUIDPipe()) deliveryId: string,
  ) {
    return this.getCommunicationNotificationDeliveryUseCase.execute(deliveryId);
  }
}
