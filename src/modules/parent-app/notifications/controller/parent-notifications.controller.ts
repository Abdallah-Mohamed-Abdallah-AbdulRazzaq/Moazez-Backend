import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArchiveParentNotificationUseCase,
  GetParentNotificationUseCase,
  GetParentNotificationsSummaryUseCase,
  ListParentNotificationsUseCase,
  MarkAllParentNotificationsReadUseCase,
  MarkParentNotificationReadUseCase,
} from '../application/parent-notifications.use-cases';
import {
  ListParentNotificationsQueryDto,
  ParentNotificationResponseDto,
  ParentNotificationsListResponseDto,
  ParentNotificationsReadAllResponseDto,
  ParentNotificationsSummaryDto,
} from '../dto/parent-notifications.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/notifications')
export class ParentNotificationsController {
  constructor(
    private readonly listParentNotificationsUseCase: ListParentNotificationsUseCase,
    private readonly getParentNotificationUseCase: GetParentNotificationUseCase,
    private readonly getParentNotificationsSummaryUseCase: GetParentNotificationsSummaryUseCase,
    private readonly markParentNotificationReadUseCase: MarkParentNotificationReadUseCase,
    private readonly markAllParentNotificationsReadUseCase: MarkAllParentNotificationsReadUseCase,
    private readonly archiveParentNotificationUseCase: ArchiveParentNotificationUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentNotificationsListResponseDto })
  listNotifications(
    @Query() query: ListParentNotificationsQueryDto,
  ): Promise<ParentNotificationsListResponseDto> {
    return this.listParentNotificationsUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: ParentNotificationsSummaryDto })
  getSummary(): Promise<ParentNotificationsSummaryDto> {
    return this.getParentNotificationsSummaryUseCase.execute();
  }

  @Post('read-all')
  @ApiCreatedResponse({ type: ParentNotificationsReadAllResponseDto })
  markAllRead(): Promise<ParentNotificationsReadAllResponseDto> {
    return this.markAllParentNotificationsReadUseCase.execute();
  }

  @Get(':notificationId')
  @ApiOkResponse({ type: ParentNotificationResponseDto })
  getNotification(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<ParentNotificationResponseDto> {
    return this.getParentNotificationUseCase.execute(notificationId);
  }

  @Post(':notificationId/read')
  @ApiCreatedResponse({ type: ParentNotificationResponseDto })
  markRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<ParentNotificationResponseDto> {
    return this.markParentNotificationReadUseCase.execute(notificationId);
  }

  @Post(':notificationId/archive')
  @ApiCreatedResponse({ type: ParentNotificationResponseDto })
  archive(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<ParentNotificationResponseDto> {
    return this.archiveParentNotificationUseCase.execute(notificationId);
  }
}
