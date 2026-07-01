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
  ArchiveStudentNotificationUseCase,
  GetStudentNotificationPreferencesUseCase,
  GetStudentNotificationUseCase,
  GetStudentNotificationsSummaryUseCase,
  ListStudentNotificationsUseCase,
  MarkAllStudentNotificationsReadUseCase,
  MarkStudentNotificationReadUseCase,
  RegisterStudentDeviceTokenUseCase,
  UnregisterStudentDeviceTokenUseCase,
  UpdateStudentNotificationPreferencesUseCase,
} from '../application/student-notifications.use-cases';
import {
  AppDeviceTokenDualRegisterResponseDto,
  AppDeviceTokenDualUnregisterResponseDto,
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import {
  ListStudentNotificationsQueryDto,
  StudentNotificationPreferencesResponseDto,
  StudentNotificationResponseDto,
  StudentNotificationsListResponseDto,
  StudentNotificationsReadAllResponseDto,
  StudentNotificationsSummaryDto,
  UpdateStudentNotificationPreferencesDto,
} from '../dto/student-notifications.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/notifications')
export class StudentNotificationsController {
  constructor(
    private readonly listStudentNotificationsUseCase: ListStudentNotificationsUseCase,
    private readonly getStudentNotificationUseCase: GetStudentNotificationUseCase,
    private readonly getStudentNotificationsSummaryUseCase: GetStudentNotificationsSummaryUseCase,
    private readonly markStudentNotificationReadUseCase: MarkStudentNotificationReadUseCase,
    private readonly markAllStudentNotificationsReadUseCase: MarkAllStudentNotificationsReadUseCase,
    private readonly archiveStudentNotificationUseCase: ArchiveStudentNotificationUseCase,
    private readonly getStudentNotificationPreferencesUseCase: GetStudentNotificationPreferencesUseCase,
    private readonly updateStudentNotificationPreferencesUseCase: UpdateStudentNotificationPreferencesUseCase,
    private readonly registerStudentDeviceTokenUseCase: RegisterStudentDeviceTokenUseCase,
    private readonly unregisterStudentDeviceTokenUseCase: UnregisterStudentDeviceTokenUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentNotificationsListResponseDto })
  @RequiredPermissions('communication.notifications.view')
  listNotifications(
    @Query() query: ListStudentNotificationsQueryDto,
  ): Promise<StudentNotificationsListResponseDto> {
    return this.listStudentNotificationsUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentNotificationsSummaryDto })
  @RequiredPermissions('communication.notifications.view')
  getSummary(): Promise<StudentNotificationsSummaryDto> {
    return this.getStudentNotificationsSummaryUseCase.execute();
  }

  @Post('read-all')
  @ApiCreatedResponse({ type: StudentNotificationsReadAllResponseDto })
  @RequiredPermissions('communication.notifications.read')
  markAllRead(): Promise<StudentNotificationsReadAllResponseDto> {
    return this.markAllStudentNotificationsReadUseCase.execute();
  }

  @Get('preferences')
  @ApiOkResponse({ type: StudentNotificationPreferencesResponseDto })
  @RequiredPermissions('communication.notifications.view')
  getPreferences(): Promise<StudentNotificationPreferencesResponseDto> {
    return this.getStudentNotificationPreferencesUseCase.execute();
  }

  @Patch('preferences')
  @ApiOkResponse({ type: StudentNotificationPreferencesResponseDto })
  @RequiredPermissions('communication.notifications.preferences.manage')
  updatePreferences(
    @Body() body: UpdateStudentNotificationPreferencesDto,
  ): Promise<StudentNotificationPreferencesResponseDto> {
    return this.updateStudentNotificationPreferencesUseCase.execute(body);
  }

  @Post('device-tokens')
  @ApiCreatedResponse({ type: AppDeviceTokenDualRegisterResponseDto })
  @RequiredPermissions('app.device_tokens.manage')
  registerDeviceToken(
    @Body() body: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualRegisterResponseDto> {
    return this.registerStudentDeviceTokenUseCase.execute(body);
  }

  @Delete('device-tokens/current')
  @ApiOkResponse({ type: AppDeviceTokenDualUnregisterResponseDto })
  @RequiredPermissions('app.device_tokens.manage')
  unregisterCurrentDeviceToken(
    @Body() body: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualUnregisterResponseDto> {
    return this.unregisterStudentDeviceTokenUseCase.execute(body);
  }

  @Get(':notificationId')
  @ApiOkResponse({ type: StudentNotificationResponseDto })
  @RequiredPermissions('communication.notifications.view')
  getNotification(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<StudentNotificationResponseDto> {
    return this.getStudentNotificationUseCase.execute(notificationId);
  }

  @Post(':notificationId/read')
  @ApiCreatedResponse({ type: StudentNotificationResponseDto })
  @RequiredPermissions('communication.notifications.read')
  markRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<StudentNotificationResponseDto> {
    return this.markStudentNotificationReadUseCase.execute(notificationId);
  }

  @Post(':notificationId/archive')
  @ApiCreatedResponse({ type: StudentNotificationResponseDto })
  @RequiredPermissions('communication.notifications.archive')
  archive(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<StudentNotificationResponseDto> {
    return this.archiveStudentNotificationUseCase.execute(notificationId);
  }
}
