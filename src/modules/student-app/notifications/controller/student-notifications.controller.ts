import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArchiveStudentNotificationUseCase,
  GetStudentNotificationUseCase,
  GetStudentNotificationsSummaryUseCase,
  ListStudentNotificationsUseCase,
  MarkAllStudentNotificationsReadUseCase,
  MarkStudentNotificationReadUseCase,
} from '../application/student-notifications.use-cases';
import {
  ListStudentNotificationsQueryDto,
  StudentNotificationResponseDto,
  StudentNotificationsListResponseDto,
  StudentNotificationsReadAllResponseDto,
  StudentNotificationsSummaryDto,
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
