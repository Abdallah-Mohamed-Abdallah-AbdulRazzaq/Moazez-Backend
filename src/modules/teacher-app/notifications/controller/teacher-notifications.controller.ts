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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  ArchiveTeacherNotificationUseCase,
  GetTeacherNotificationPreferencesUseCase,
  GetTeacherNotificationUseCase,
  GetTeacherNotificationsSummaryUseCase,
  ListTeacherNotificationsUseCase,
  MarkAllTeacherNotificationsReadUseCase,
  MarkTeacherNotificationReadUseCase,
  RegisterTeacherDeviceTokenUseCase,
  UnregisterTeacherDeviceTokenUseCase,
  UpdateTeacherNotificationPreferencesUseCase,
} from '../application/teacher-notifications.use-cases';
import {
  AppDeviceTokenRegisterResponseDto,
  AppDeviceTokenUnregisterResponseDto,
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import {
  ListTeacherNotificationsQueryDto,
  TeacherNotificationPreferencesResponseDto,
  TeacherNotificationResponseDto,
  TeacherNotificationsListResponseDto,
  TeacherNotificationsReadAllResponseDto,
  TeacherNotificationsSummaryDto,
  UpdateTeacherNotificationPreferencesDto,
} from '../dto/teacher-notifications.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/notifications')
export class TeacherNotificationsController {
  constructor(
    private readonly listTeacherNotificationsUseCase: ListTeacherNotificationsUseCase,
    private readonly getTeacherNotificationUseCase: GetTeacherNotificationUseCase,
    private readonly getTeacherNotificationsSummaryUseCase: GetTeacherNotificationsSummaryUseCase,
    private readonly markTeacherNotificationReadUseCase: MarkTeacherNotificationReadUseCase,
    private readonly markAllTeacherNotificationsReadUseCase: MarkAllTeacherNotificationsReadUseCase,
    private readonly archiveTeacherNotificationUseCase: ArchiveTeacherNotificationUseCase,
    private readonly getTeacherNotificationPreferencesUseCase: GetTeacherNotificationPreferencesUseCase,
    private readonly updateTeacherNotificationPreferencesUseCase: UpdateTeacherNotificationPreferencesUseCase,
    private readonly registerTeacherDeviceTokenUseCase: RegisterTeacherDeviceTokenUseCase,
    private readonly unregisterTeacherDeviceTokenUseCase: UnregisterTeacherDeviceTokenUseCase,
  ) {}

  @Get()
  @RequiredPermissions('communication.notifications.view')
  @ApiOkResponse({ type: TeacherNotificationsListResponseDto })
  listNotifications(
    @Query() query: ListTeacherNotificationsQueryDto,
  ): Promise<TeacherNotificationsListResponseDto> {
    return this.listTeacherNotificationsUseCase.execute(query);
  }

  @Get('summary')
  @RequiredPermissions('communication.notifications.view')
  @ApiOkResponse({ type: TeacherNotificationsSummaryDto })
  getSummary(): Promise<TeacherNotificationsSummaryDto> {
    return this.getTeacherNotificationsSummaryUseCase.execute();
  }

  @Post('read-all')
  @ApiCreatedResponse({ type: TeacherNotificationsReadAllResponseDto })
  markAllRead(): Promise<TeacherNotificationsReadAllResponseDto> {
    return this.markAllTeacherNotificationsReadUseCase.execute();
  }

  @Get('preferences')
  @RequiredPermissions('communication.notifications.preferences.manage')
  @ApiOkResponse({ type: TeacherNotificationPreferencesResponseDto })
  getPreferences(): Promise<TeacherNotificationPreferencesResponseDto> {
    return this.getTeacherNotificationPreferencesUseCase.execute();
  }

  @Patch('preferences')
  @ApiOkResponse({ type: TeacherNotificationPreferencesResponseDto })
  updatePreferences(
    @Body() body: UpdateTeacherNotificationPreferencesDto,
  ): Promise<TeacherNotificationPreferencesResponseDto> {
    return this.updateTeacherNotificationPreferencesUseCase.execute(body);
  }

  @Post('device-tokens')
  @ApiCreatedResponse({ type: AppDeviceTokenRegisterResponseDto })
  registerDeviceToken(
    @Body() body: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenRegisterResponseDto> {
    return this.registerTeacherDeviceTokenUseCase.execute(body);
  }

  @Delete('device-tokens/current')
  @ApiOkResponse({ type: AppDeviceTokenUnregisterResponseDto })
  unregisterCurrentDeviceToken(
    @Body() body: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenUnregisterResponseDto> {
    return this.unregisterTeacherDeviceTokenUseCase.execute(body);
  }

  @Get(':notificationId')
  @RequiredPermissions('communication.notifications.view')
  @ApiOkResponse({ type: TeacherNotificationResponseDto })
  getNotification(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<TeacherNotificationResponseDto> {
    return this.getTeacherNotificationUseCase.execute(notificationId);
  }

  @Post(':notificationId/read')
  @ApiCreatedResponse({ type: TeacherNotificationResponseDto })
  markRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<TeacherNotificationResponseDto> {
    return this.markTeacherNotificationReadUseCase.execute(notificationId);
  }

  @Post(':notificationId/archive')
  @ApiCreatedResponse({ type: TeacherNotificationResponseDto })
  archive(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<TeacherNotificationResponseDto> {
    return this.archiveTeacherNotificationUseCase.execute(notificationId);
  }
}
