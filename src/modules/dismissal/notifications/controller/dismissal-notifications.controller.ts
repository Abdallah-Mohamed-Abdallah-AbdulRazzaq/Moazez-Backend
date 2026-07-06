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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { ListDismissalNotificationsUseCase } from '../application/list-dismissal-notifications.use-case';
import { MarkAllDismissalNotificationsReadUseCase } from '../application/mark-all-dismissal-notifications-read.use-case';
import { MarkDismissalNotificationReadUseCase } from '../application/mark-dismissal-notification-read.use-case';
import {
  RegisterDismissalDeviceTokenUseCase,
  UnregisterDismissalDeviceTokenUseCase,
} from '../application/dismissal-device-token.use-cases';
import {
  AppDeviceTokenRegisterResponseDto,
  AppDeviceTokenUnregisterResponseDto,
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
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
    private readonly registerDismissalDeviceTokenUseCase: RegisterDismissalDeviceTokenUseCase,
    private readonly unregisterDismissalDeviceTokenUseCase: UnregisterDismissalDeviceTokenUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.notifications.view')
  @ApiOkResponse({ type: DismissalNotificationsListResponseDto })
  listNotifications(
    @Query() query: ListDismissalNotificationsQueryDto,
  ): Promise<DismissalNotificationsListResponseDto> {
    return this.listDismissalNotificationsUseCase.execute(query);
  }

  @Post('device-tokens')
  @RequiredPermissions('app.device_tokens.manage')
  @ApiCreatedResponse({ type: AppDeviceTokenRegisterResponseDto })
  registerDeviceToken(
    @Body() body: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenRegisterResponseDto> {
    return this.registerDismissalDeviceTokenUseCase.execute(body);
  }

  @Delete('device-tokens/current')
  @RequiredPermissions('app.device_tokens.manage')
  @ApiOkResponse({ type: AppDeviceTokenUnregisterResponseDto })
  unregisterCurrentDeviceToken(
    @Body() body: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenUnregisterResponseDto> {
    return this.unregisterDismissalDeviceTokenUseCase.execute(body);
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
