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
  ArchiveStudentNotificationUseCase,
  GetStudentNotificationPreferencesUseCase,
  GetStudentNotificationUseCase,
  GetStudentNotificationsSummaryUseCase,
  ListStudentNotificationsUseCase,
  MarkAllStudentNotificationsReadUseCase,
  MarkStudentNotificationReadUseCase,
  UpdateStudentNotificationPreferencesUseCase,
} from '../application/student-notifications.use-cases';
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
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentNotificationsListResponseDto })
  listNotifications(
    @Query() query: ListStudentNotificationsQueryDto,
  ): Promise<StudentNotificationsListResponseDto> {
    return this.listStudentNotificationsUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentNotificationsSummaryDto })
  getSummary(): Promise<StudentNotificationsSummaryDto> {
    return this.getStudentNotificationsSummaryUseCase.execute();
  }

  @Post('read-all')
  @ApiCreatedResponse({ type: StudentNotificationsReadAllResponseDto })
  markAllRead(): Promise<StudentNotificationsReadAllResponseDto> {
    return this.markAllStudentNotificationsReadUseCase.execute();
  }

  @Get('preferences')
  @ApiOkResponse({ type: StudentNotificationPreferencesResponseDto })
  getPreferences(): Promise<StudentNotificationPreferencesResponseDto> {
    return this.getStudentNotificationPreferencesUseCase.execute();
  }

  @Patch('preferences')
  @ApiOkResponse({ type: StudentNotificationPreferencesResponseDto })
  updatePreferences(
    @Body() body: UpdateStudentNotificationPreferencesDto,
  ): Promise<StudentNotificationPreferencesResponseDto> {
    return this.updateStudentNotificationPreferencesUseCase.execute(body);
  }

  @Get(':notificationId')
  @ApiOkResponse({ type: StudentNotificationResponseDto })
  getNotification(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<StudentNotificationResponseDto> {
    return this.getStudentNotificationUseCase.execute(notificationId);
  }

  @Post(':notificationId/read')
  @ApiCreatedResponse({ type: StudentNotificationResponseDto })
  markRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<StudentNotificationResponseDto> {
    return this.markStudentNotificationReadUseCase.execute(notificationId);
  }

  @Post(':notificationId/archive')
  @ApiCreatedResponse({ type: StudentNotificationResponseDto })
  archive(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ): Promise<StudentNotificationResponseDto> {
    return this.archiveStudentNotificationUseCase.execute(notificationId);
  }
}
