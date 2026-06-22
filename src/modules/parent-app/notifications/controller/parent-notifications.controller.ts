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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArchiveParentNotificationUseCase,
  GetParentNotificationPreferencesUseCase,
  GetParentNotificationUseCase,
  GetParentNotificationsSummaryUseCase,
  ListParentNotificationsUseCase,
  MarkAllParentNotificationsReadUseCase,
  MarkParentNotificationReadUseCase,
  RegisterParentDeviceTokenUseCase,
  UnregisterParentDeviceTokenUseCase,
  UpdateParentNotificationPreferencesUseCase,
} from '../application/parent-notifications.use-cases';
import {
  AppDeviceTokenDualRegisterResponseDto,
  AppDeviceTokenDualUnregisterResponseDto,
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import {
  ListParentNotificationsQueryDto,
  ParentNotificationPreferencesResponseDto,
  ParentNotificationResponseDto,
  ParentNotificationsListResponseDto,
  ParentNotificationsReadAllResponseDto,
  ParentNotificationsSummaryDto,
  UpdateParentNotificationPreferencesDto,
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
    private readonly getParentNotificationPreferencesUseCase: GetParentNotificationPreferencesUseCase,
    private readonly updateParentNotificationPreferencesUseCase: UpdateParentNotificationPreferencesUseCase,
    private readonly registerParentDeviceTokenUseCase: RegisterParentDeviceTokenUseCase,
    private readonly unregisterParentDeviceTokenUseCase: UnregisterParentDeviceTokenUseCase,
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

  @Get('preferences')
  @ApiOkResponse({ type: ParentNotificationPreferencesResponseDto })
  getPreferences(): Promise<ParentNotificationPreferencesResponseDto> {
    return this.getParentNotificationPreferencesUseCase.execute();
  }

  @Patch('preferences')
  @ApiOkResponse({ type: ParentNotificationPreferencesResponseDto })
  updatePreferences(
    @Body() body: UpdateParentNotificationPreferencesDto,
  ): Promise<ParentNotificationPreferencesResponseDto> {
    return this.updateParentNotificationPreferencesUseCase.execute(body);
  }

  @Post('device-tokens')
  @ApiCreatedResponse({ type: AppDeviceTokenDualRegisterResponseDto })
  registerDeviceToken(
    @Body() body: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualRegisterResponseDto> {
    return this.registerParentDeviceTokenUseCase.execute(body);
  }

  @Delete('device-tokens/current')
  @ApiOkResponse({ type: AppDeviceTokenDualUnregisterResponseDto })
  unregisterCurrentDeviceToken(
    @Body() body: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualUnregisterResponseDto> {
    return this.unregisterParentDeviceTokenUseCase.execute(body);
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
