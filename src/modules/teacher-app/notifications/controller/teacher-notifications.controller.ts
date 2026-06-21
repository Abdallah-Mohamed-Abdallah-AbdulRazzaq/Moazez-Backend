import {
  Body,
  Controller,
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
  ArchiveTeacherNotificationUseCase,
  GetTeacherNotificationPreferencesUseCase,
  GetTeacherNotificationUseCase,
  GetTeacherNotificationsSummaryUseCase,
  ListTeacherNotificationsUseCase,
  MarkAllTeacherNotificationsReadUseCase,
  MarkTeacherNotificationReadUseCase,
  UpdateTeacherNotificationPreferencesUseCase,
} from '../application/teacher-notifications.use-cases';
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
  ) {}

  @Get()
  @ApiOkResponse({ type: TeacherNotificationsListResponseDto })
  listNotifications(
    @Query() query: ListTeacherNotificationsQueryDto,
  ): Promise<TeacherNotificationsListResponseDto> {
    return this.listTeacherNotificationsUseCase.execute(query);
  }

  @Get('summary')
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

  @Get(':notificationId')
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
