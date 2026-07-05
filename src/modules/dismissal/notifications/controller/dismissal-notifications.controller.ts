import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { ListDismissalNotificationsUseCase } from '../application/list-dismissal-notifications.use-case';
import { MarkAllDismissalNotificationsReadUseCase } from '../application/mark-all-dismissal-notifications-read.use-case';
import { MarkDismissalNotificationReadUseCase } from '../application/mark-dismissal-notification-read.use-case';
import {
  DismissalNotificationReadResponseDto,
  DismissalNotificationsListResponseDto,
  DismissalNotificationsReadAllResponseDto,
  ListDismissalNotificationsQueryDto,
} from '../dto/dismissal-notifications-query.dto';

@ApiTags('dismissal-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/notifications')
export class DismissalNotificationsController {
  constructor(
    private readonly listDismissalNotificationsUseCase: ListDismissalNotificationsUseCase,
    private readonly markDismissalNotificationReadUseCase: MarkDismissalNotificationReadUseCase,
    private readonly markAllDismissalNotificationsReadUseCase: MarkAllDismissalNotificationsReadUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.notifications.view')
  @ApiOkResponse({ type: DismissalNotificationsListResponseDto })
  listNotifications(
    @Query() query: ListDismissalNotificationsQueryDto,
  ): Promise<DismissalNotificationsListResponseDto> {
    return this.listDismissalNotificationsUseCase.execute(query);
  }

  @Patch('read-all')
  @RequiredPermissions('dismissal.notifications.manage')
  @ApiOkResponse({ type: DismissalNotificationsReadAllResponseDto })
  markAllRead(): Promise<DismissalNotificationsReadAllResponseDto> {
    return this.markAllDismissalNotificationsReadUseCase.execute();
  }

  @Patch(':id/read')
  @RequiredPermissions('dismissal.notifications.manage')
  @ApiOkResponse({ type: DismissalNotificationReadResponseDto })
  markRead(
    @Param('id', new ParseUUIDPipe()) notificationId: string,
  ): Promise<DismissalNotificationReadResponseDto> {
    return this.markDismissalNotificationReadUseCase.execute(notificationId);
  }
}
