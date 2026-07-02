import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  ArchiveTeacherAnnouncementUseCase,
  CreateTeacherAnnouncementUseCase,
  GetTeacherAnnouncementUseCase,
  ListTeacherAnnouncementsUseCase,
  PublishTeacherAnnouncementUseCase,
  UpdateTeacherAnnouncementUseCase,
} from '../application/teacher-announcements.use-cases';
import {
  CreateTeacherAnnouncementDto,
  ListTeacherAnnouncementsQueryDto,
  TeacherAnnouncementParamsDto,
  TeacherAnnouncementResponseDto,
  TeacherAnnouncementsListResponseDto,
  UpdateTeacherAnnouncementDto,
} from '../dto/teacher-announcements.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/announcements')
export class TeacherAnnouncementsController {
  constructor(
    private readonly listTeacherAnnouncementsUseCase: ListTeacherAnnouncementsUseCase,
    private readonly getTeacherAnnouncementUseCase: GetTeacherAnnouncementUseCase,
    private readonly createTeacherAnnouncementUseCase: CreateTeacherAnnouncementUseCase,
    private readonly updateTeacherAnnouncementUseCase: UpdateTeacherAnnouncementUseCase,
    private readonly publishTeacherAnnouncementUseCase: PublishTeacherAnnouncementUseCase,
    private readonly archiveTeacherAnnouncementUseCase: ArchiveTeacherAnnouncementUseCase,
  ) {}

  @Get()
  @RequiredPermissions('communication.announcements.view')
  @ApiOkResponse({ type: TeacherAnnouncementsListResponseDto })
  listAnnouncements(
    @Query() query: ListTeacherAnnouncementsQueryDto,
  ): Promise<TeacherAnnouncementsListResponseDto> {
    return this.listTeacherAnnouncementsUseCase.execute(query);
  }

  @Get(':announcementId')
  @RequiredPermissions('communication.announcements.view')
  @ApiOkResponse({ type: TeacherAnnouncementResponseDto })
  getAnnouncement(
    @Param() params: TeacherAnnouncementParamsDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    return this.getTeacherAnnouncementUseCase.execute(params.announcementId);
  }

  @Post()
  @ApiCreatedResponse({ type: TeacherAnnouncementResponseDto })
  createAnnouncement(
    @Body() dto: CreateTeacherAnnouncementDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    return this.createTeacherAnnouncementUseCase.execute(dto);
  }

  @Patch(':announcementId')
  @ApiOkResponse({ type: TeacherAnnouncementResponseDto })
  updateAnnouncement(
    @Param() params: TeacherAnnouncementParamsDto,
    @Body() dto: UpdateTeacherAnnouncementDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    return this.updateTeacherAnnouncementUseCase.execute(
      params.announcementId,
      dto,
    );
  }

  @Post(':announcementId/publish')
  @ApiCreatedResponse({ type: TeacherAnnouncementResponseDto })
  publishAnnouncement(
    @Param() params: TeacherAnnouncementParamsDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    return this.publishTeacherAnnouncementUseCase.execute(
      params.announcementId,
    );
  }

  @Post(':announcementId/archive')
  @ApiCreatedResponse({ type: TeacherAnnouncementResponseDto })
  archiveAnnouncement(
    @Param() params: TeacherAnnouncementParamsDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    return this.archiveTeacherAnnouncementUseCase.execute(
      params.announcementId,
    );
  }
}
