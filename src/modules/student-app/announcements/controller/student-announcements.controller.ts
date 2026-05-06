import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetStudentAnnouncementUseCase } from '../application/get-student-announcement.use-case';
import { ListStudentAnnouncementAttachmentsUseCase } from '../application/list-student-announcement-attachments.use-case';
import { ListStudentAnnouncementsUseCase } from '../application/list-student-announcements.use-case';
import { MarkStudentAnnouncementReadUseCase } from '../application/mark-student-announcement-read.use-case';
import {
  StudentAnnouncementAttachmentsResponseDto,
  StudentAnnouncementReadResponseDto,
  StudentAnnouncementResponseDto,
  StudentAnnouncementsListResponseDto,
  StudentAnnouncementsQueryDto,
} from '../dto/student-announcements.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/announcements')
export class StudentAnnouncementsController {
  constructor(
    private readonly listStudentAnnouncementsUseCase: ListStudentAnnouncementsUseCase,
    private readonly getStudentAnnouncementUseCase: GetStudentAnnouncementUseCase,
    private readonly markStudentAnnouncementReadUseCase: MarkStudentAnnouncementReadUseCase,
    private readonly listStudentAnnouncementAttachmentsUseCase: ListStudentAnnouncementAttachmentsUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentAnnouncementsListResponseDto })
  listAnnouncements(
    @Query() query: StudentAnnouncementsQueryDto,
  ): Promise<StudentAnnouncementsListResponseDto> {
    return this.listStudentAnnouncementsUseCase.execute(query);
  }

  @Get(':announcementId')
  @ApiOkResponse({ type: StudentAnnouncementResponseDto })
  getAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<StudentAnnouncementResponseDto> {
    return this.getStudentAnnouncementUseCase.execute(announcementId);
  }

  @Post(':announcementId/read')
  @ApiCreatedResponse({ type: StudentAnnouncementReadResponseDto })
  markRead(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<StudentAnnouncementReadResponseDto> {
    return this.markStudentAnnouncementReadUseCase.execute(announcementId);
  }

  @Get(':announcementId/attachments')
  @ApiOkResponse({ type: StudentAnnouncementAttachmentsResponseDto })
  listAttachments(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<StudentAnnouncementAttachmentsResponseDto> {
    return this.listStudentAnnouncementAttachmentsUseCase.execute(
      announcementId,
    );
  }
}
